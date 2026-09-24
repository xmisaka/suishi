/**
 * 岁时 · 备份与恢复
 *
 * 两件事：把全部日子导成一个文件，以及从文件恢复。
 *
 * 导入刻意做成「先看再动」：选完文件先弹一张预览，把导出时间、条数、
 * 文件名摊开给用户看，再让他选合并还是替换。
 * 面板本身就是第一道确认，「替换」还要再过一道红色 Alert ——
 * 导入不可逆，不该点一下就落地。
 *
 * 导出走**系统分享面板**而不是「存到某个固定位置」：用户想放哪就放哪
 * （文件管理器、网盘、发微信给自己、发邮件），应用不替他决定。
 */

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/controls';
import { MetricStrip } from '@/components/ui/feedback';
import {
  Card,
  PageHeader,
  Screen,
  ScreenScroll,
  SectionCard,
} from '@/components/ui/layout';
import { SheetModal } from '@/components/ui/sheet';
import { Body, Label, Meta, Num } from '@/components/ui/typography';
import { APP_VERSION } from '@/constants/app';
import { GUTTER, Palette, Space } from '@/constants/theme';
import {
  BACKUP_ERROR_TEXT,
  UNKNOWN_APP,
  backupFileName,
  buildBackup,
  formatStamp,
  parseBackup,
  planMerge,
  serializeBackup,
  type BackupFile,
} from '@/lib/backup';
import { listAllEvents } from '@/lib/db/events';
import { PREF_BACKUP_AT, readPref, writePref } from '@/lib/db/prefs';
import { makeStyles } from '@/lib/theme';
import { useAppState, type ImportSummary } from '@/lib/store/app-state';
import type { Anniversary } from '@/lib/types';

/** 待确认的一份备份。选完文件先停在这里，等用户决定怎么用 */
interface Pending {
  backup: BackupFile;
  events: Anniversary[];
  /** 文件里立不住、被丢掉的条目数 */
  malformed: number;
  fileName: string;
}

type Busy = 'idle' | 'export' | 'pick' | 'apply';

export default function BackupScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { importBackup, replaceAll } = useAppState();

  /** 含回收站的全部条目 —— 备份要的是完整快照，与列表页取的不是同一份 */
  const [all, setAll] = useState<Anniversary[] | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const [pending, setPending] = useState<Pending | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  /**
   * 这一屏的数据只在「进来」时读一次，之后由导入动作自己触发重读。
   *
   * 写成 promise 链而不是 `void load()`：`load` 是个 async 函数，
   * 在 effect 里直接调会被 react-hooks 的 set-state-in-effect 判为
   * 「同步 setState」（它不穿透 async 边界）。把 setState 收进 then 回调，
   * 语义没变，但分析器看得出来它不是同步发生的。
   */
  useEffect(() => {
    let alive = true;
    void listAllEvents().then(
      (rows) => {
        if (alive) setAll(rows);
      },
      () => {
        if (alive) setAll([]);
      },
    );
    void readPref(PREF_BACKUP_AT).then(
      (v) => {
        if (alive) setLastAt(v ? Number(v) : null);
      },
      () => {
        if (alive) setLastAt(null);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const reload = async () => {
    setAll(await listAllEvents());
  };

  const total = all?.length ?? 0;
  const activeCount = all?.filter((e) => e.deletedAt === null).length ?? 0;

  const metrics = [
    { label: '在册', value: String(activeCount) },
    { label: '回收站', value: String(total - activeCount) },
    { label: '合计', value: String(total) },
  ];

  /* ---------------------------------------------------------- 导出 */

  const onExport = async () => {
    if (!all || all.length === 0 || busy !== 'idle') return;
    setBusy('export');

    try {
      const now = Date.now();
      // 写进 cache：这份文件只是为了递出去，不该占用「文档」目录
      const file = new File(Paths.cache, backupFileName(now));
      if (file.exists) file.delete();
      file.create();
      file.write(serializeBackup(buildBackup(all, APP_VERSION, now)));

      if (!(await Sharing.isAvailableAsync())) {
        // 极少数设备（尤其精简 ROM）没有分享面板，至少告诉用户文件在哪
        Alert.alert('这台设备无法分享', `备份已生成在：\n${file.uri}`);
        return;
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: '导出岁时备份',
        UTI: 'public.json',
      });

      // 面板关掉后 resolve，分辨不出「发成功了」还是「点了取消」。
      // 无论如何都记一次 —— 这个时间戳是给用户自己看的参考，不是审计。
      await writePref(PREF_BACKUP_AT, String(now));
      setLastAt(now);
    } catch (err) {
      Alert.alert('导出失败', errorText(err));
    } finally {
      setBusy('idle');
    }
  };

  /* ---------------------------------------------------------- 选文件 */

  const onPick = async () => {
    if (busy !== 'idle') return;
    setBusy('pick');

    try {
      const res = await DocumentPicker.getDocumentAsync({
        // 类型放宽到 */*：.json 在不同文件管理器上报的 MIME 五花八门
        // （application/json / text/plain / octet-stream 都有）。
        // 拦错文件这件事交给 parseBackup —— 它认 kind，比 MIME 可靠。
        type: '*/*',
        // 必须为 true，否则 expo-file-system 读不到刚选中的文件
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;

      const asset = res.assets[0];
      const text = await new File(asset.uri).text();
      const parsed = parseBackup(text, Date.now());

      if (!parsed.ok) {
        Alert.alert('这份文件读不了', BACKUP_ERROR_TEXT[parsed.error]);
        return;
      }

      setPending({
        backup: parsed.backup,
        events: parsed.events,
        malformed: parsed.malformed,
        fileName: asset.name,
      });
    } catch (err) {
      Alert.alert('读取失败', errorText(err));
    } finally {
      setBusy('idle');
    }
  };

  /* ---------------------------------------------------------- 导入 */

  const onMerge = async () => {
    if (!pending || busy !== 'idle') return;
    setBusy('apply');

    try {
      // 「谁覆盖谁」是纯函数算的，页面与库都不参与判断。
      //
      // ★ 第二个参数必须传 all（含回收站）而不是在册列表：
      //   本地已软删的条目也必须在「已存在」里，否则备份里同 id 的在册版本
      //   会被当成新条目去 insert —— UPSERT 一覆盖，刚删掉的就复活了。
      const plan = planMerge(pending.events, all ?? []);
      const result = await importBackup(plan);
      setPending(null);
      setSummary(result);
      await reload();
    } catch (err) {
      Alert.alert('导入失败', errorText(err));
    } finally {
      setBusy('idle');
    }
  };

  const onReplaceAsk = () => {
    if (!pending || busy !== 'idle') return;
    Alert.alert(
      '替换现有数据？',
      `当前的 ${total} 条（含回收站）会被全部清空，再写入这份备份里的 ` +
        `${pending.events.length} 条。\n\n此操作无法撤销。`,
      [
        { text: '取消', style: 'cancel' },
        { text: '替换', style: 'destructive', onPress: () => void onReplace() },
      ],
    );
  };

  const onReplace = async () => {
    if (!pending || busy !== 'idle') return;
    setBusy('apply');

    try {
      const count = await replaceAll(pending.events);
      setPending(null);
      setSummary({ inserted: count, updated: 0, skipped: 0 });
      await reload();
    } catch (err) {
      Alert.alert('替换失败', errorText(err));
    } finally {
      setBusy('idle');
    }
  };

  /* ---------------------------------------------------------- 渲染 */

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" accessibilityLabel="返回" onPress={() => router.back()} />
      </View>

      <PageHeader title="备份与恢复" subtitle="导出成一个文件，或从文件恢复" />

      <ScreenScroll bottomInset={Space.xxxl}>
        {all === null ? (
          <Meta tone="ink3" style={styles.loadingText}>
            正在读取…
          </Meta>
        ) : (
          <>
            <Card padded={false} style={styles.metricsCard}>
              <MetricStrip metrics={metrics} framed={false} />
            </Card>

            <SectionCard title="备份">
              <Card padded={false} style={styles.groupCard}>
                <View style={styles.block}>
                  <Body tone="ink2" style={styles.desc}>
                    把全部日子导出成一个 JSON 文件，在册的和回收站里的都算。
                    存到网盘、发给自己或发给别人，都可以。
                  </Body>
                  <Meta tone="ink3">
                    上次导出：{formatStamp(lastAt)}
                  </Meta>
                  <Button
                    label={total === 0 ? '还没有日子可以导出' : '导出备份文件'}
                    icon="download-outline"
                    disabled={total === 0}
                    loading={busy === 'export'}
                    onPress={() => void onExport()}
                    style={styles.action}
                  />
                </View>
              </Card>
            </SectionCard>

            <SectionCard title="恢复">
              <Card padded={false} style={styles.groupCard}>
                <View style={styles.block}>
                  <Body tone="ink2" style={styles.desc}>
                    选一份之前导出的备份文件。导入前会先让你看一眼里面是什么，
                    再决定怎么放进来。
                  </Body>
                  <Button
                    label="选择备份文件"
                    tone="secondary"
                    icon="document-outline"
                    loading={busy === 'pick'}
                    onPress={() => void onPick()}
                    style={styles.action}
                  />
                </View>
              </Card>
            </SectionCard>

            <SectionCard title="规则">
              <Card style={styles.ruleCard}>
                <Rule
                  label="合并"
                  text="同一条记录（id 相同）以改动较新的为准，所以同一份文件导入两次，第二次不会产生任何变化。"
                />
                <Rule
                  label="替换"
                  text="导入时也可以选「替换现有数据」：先清空当前的全部条目（含回收站），再整体写入备份。不可撤销，需要过一次红色确认。"
                />
                <Rule
                  label="不含偏好"
                  text="备份里只有日子，没有主题等界面偏好 —— 那些属于「这台设备上怎么看」，不属于你的数据。"
                />
              </Card>
            </SectionCard>

            <Meta tone="ink4" style={styles.footer}>
              备份文件是纯文本，可以直接打开看，也可以自己改。改坏了不会被吃掉，导入时会告诉你哪里不对。
            </Meta>
          </>
        )}
      </ScreenScroll>

      {pending ? (
        <PreviewSheet
          pending={pending}
          localTotal={total}
          busy={busy === 'apply'}
          onMerge={() => void onMerge()}
          onReplace={onReplaceAsk}
          onClose={() => setPending(null)}
        />
      ) : null}

      {summary ? <ResultSheet summary={summary} onClose={() => setSummary(null)} /> : null}
    </Screen>
  );
}

/* ------------------------------------------------------------ 导入预览 */

/**
 * 导入前的预览面板。
 *
 * 它也是第一道确认 —— 用户在这一屏看到「导出时间」与「多少条」之后，
 * 才有可能发现自己选错了文件（比如拿了一份半年前的旧备份）。
 */
function PreviewSheet({
  pending,
  localTotal,
  busy,
  onMerge,
  onReplace,
  onClose,
}: {
  pending: Pending;
  localTotal: number;
  busy: boolean;
  onMerge: () => void;
  onReplace: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { backup, events, malformed, fileName } = pending;
  const active = events.filter((e) => e.deletedAt === null).length;

  return (
    <SheetModal
      visible
      title="这份备份"
      onClose={onClose}
      footer={
        <View style={styles.previewActions}>
          <Button
            label={`合并导入到现有 ${localTotal} 条里`}
            icon="arrow-down-circle-outline"
            loading={busy}
            onPress={onMerge}
          />
          <Button
            label="替换现有数据"
            tone="danger"
            icon="swap-horizontal-outline"
            disabled={busy}
            onPress={onReplace}
          />
        </View>
      }>
      <View style={styles.previewCount}>
        <Num tone="brand">{String(events.length)}</Num>
        <Meta tone="ink3">条日子</Meta>
      </View>

      <View style={styles.previewRows}>
        <PreviewRow label="导出时间" value={formatStamp(backup.exportedAt)} />
        <PreviewRow
          label="导出方"
          value={backup.app === UNKNOWN_APP ? UNKNOWN_APP : `岁时 v${backup.app}`}
        />
        <PreviewRow label="在册" value={`${active} 条`} />
        <PreviewRow label="回收站" value={`${events.length - active} 条`} />
        <PreviewRow label="文件" value={fileName} />
      </View>

      {malformed > 0 ? (
        <Body tone="clay" style={styles.warn}>
          文件里有 {malformed} 条记录缺了 id 或名字，读不出来，会被跳过。其余的照常导入。
        </Body>
      ) : null}
    </SheetModal>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.previewRow}>
      <Label tone="ink3">{label}</Label>
      <Body tone="ink" numberOfLines={1} style={styles.previewValue}>
        {value}
      </Body>
    </View>
  );
}

/* ------------------------------------------------------------ 导入结果 */

function ResultSheet({ summary, onClose }: { summary: ImportSummary; onClose: () => void }) {
  const styles = useStyles();
  const written = summary.inserted + summary.updated;
  const nothingChanged = written === 0;

  return (
    <SheetModal
      visible
      title="导入完成"
      onClose={onClose}
      footer={<Button label="好" tone="secondary" onPress={onClose} />}>
      <View style={styles.previewCount}>
        <Num tone={nothingChanged ? 'ink2' : 'brand'}>{String(written)}</Num>
        <Meta tone="ink3">{nothingChanged ? '条需要变动' : '条已写入'}</Meta>
      </View>

      <View style={styles.previewRows}>
        <PreviewRow label="新增" value={`${summary.inserted} 条`} />
        <PreviewRow label="更新" value={`${summary.updated} 条`} />
        <PreviewRow label="跳过" value={`${summary.skipped} 条`} />
      </View>

      <Meta tone="ink3" style={styles.warn}>
        {nothingChanged
          ? '本地数据和这份备份已经一致，没有需要改的地方。'
          : `「跳过」是本地已有、且不比备份旧的记录，没有动它们。`}
      </Meta>
    </SheetModal>
  );
}

/* ------------------------------------------------------------ 规则行 */

function Rule({ label, text }: { label: string; text: string }) {
  const styles = useStyles();
  return (
    <View>
      <Label color={Palette.brand} style={styles.ruleLabel}>
        {label}
      </Label>
      <Body tone="ink2" style={styles.ruleText}>
        {text}
      </Body>
    </View>
  );
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const useStyles = makeStyles((Palette) => ({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  metricsCard: { marginHorizontal: GUTTER, marginTop: Space.xs },
  loadingText: { textAlign: 'center', paddingVertical: Space.xxxl },

  /**
   * 分组卡要自己让出左右边距。
   * SectionCard 只给标题加 GUTTER，内容区是裸露的 —— 漏了不报错，只在视觉上贴边。
   */
  groupCard: { marginHorizontal: GUTTER },
  block: { padding: Space.lg, gap: Space.md },
  desc: { lineHeight: 22 },
  action: { marginTop: Space.xs },

  ruleCard: { marginHorizontal: GUTTER, padding: Space.lg, gap: Space.lg },
  ruleLabel: { fontSize: 11, letterSpacing: 2, marginBottom: Space.xs },
  ruleText: { lineHeight: 21 },

  footer: {
    textAlign: 'center',
    marginTop: Space.xxl,
    paddingHorizontal: 32,
    fontSize: 11.5,
    lineHeight: 18,
  },

  previewCount: { flexDirection: 'row', alignItems: 'baseline', gap: Space.sm },
  previewRows: { marginTop: Space.lg, gap: Space.md },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  previewValue: { flex: 1, textAlign: 'right', fontWeight: '500' },
  warn: { marginTop: Space.lg, lineHeight: 20 },
  previewActions: { gap: Space.sm },
}));
