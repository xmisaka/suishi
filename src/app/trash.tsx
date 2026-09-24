/**
 * 岁时 · 回收站
 *
 * 删除一律是软删，所以必须有这一屏 —— 否则「误删一条重要的日子」就没救了，
 * 而这个应用里每一条都重要。
 *
 * 恢复放在主操作位，彻底删除放在次位且要二次确认：
 * 来这一屏的人，绝大多数是来找回东西的。
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Card, Gutter, PageHeader, Screen, ScreenScroll } from '@/components/ui/layout';
import { Button, IconButton } from '@/components/ui/controls';
import { EmptyState, Loading } from '@/components/ui/feedback';
import { Body, Label, Meta } from '@/components/ui/typography';
import { Palette, Space } from '@/constants/theme';
import { resolveOccurrence } from '@/lib/calendar/resolve';
import { describeDays, formatMD } from '@/lib/date';
import { emptyTrash, listDeleted, purgeEvent, restoreEvent } from '@/lib/db/events';
import { makeStyles } from '@/lib/theme';
import { useAppState } from '@/lib/store/app-state';
import type { Anniversary } from '@/lib/types';

export default function TrashScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { today, refresh } = useAppState();

  const [rows, setRows] = useState<Anniversary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const list = await listDeleted();
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    // `load` 是 async 函数，setState 都在 await 之后；
    // react-hooks 的 set-state-in-effect 不穿透 async 边界，这条是误报。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const onRestore = async (id: string) => {
    await restoreEvent(id);
    await load();
    await refresh();
  };

  const onPurge = (item: Anniversary) => {
    Alert.alert('彻底删除？', `「${item.name}」将被永久删除，无法恢复。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '永久删除',
        style: 'destructive',
        onPress: () => {
          void purgeEvent(item.id).then(load);
        },
      },
    ]);
  };

  const onEmpty = () => {
    if (rows.length === 0) return;
    Alert.alert('清空回收站？', `${rows.length} 条记录将被永久删除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          void emptyTrash().then(load);
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" accessibilityLabel="返回" onPress={() => router.back()} />
        <View style={styles.spacer} />
        {rows.length > 0 ? (
          <Label color={Palette.clay} style={styles.empty} onPress={onEmpty}>
            清空
          </Label>
        ) : null}
      </View>

      <PageHeader title="回收站" subtitle={rows.length > 0 ? `${rows.length} 条记录` : '空的'} />

      <ScreenScroll bottomInset={Space.xxxl}>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="trash-outline"
            title="回收站是空的"
            description="删掉的日子会先来这里，随时可以找回。"
          />
        ) : (
          <Gutter>
            <View style={styles.list}>
              {rows.map((item) => {
                const occ = resolveOccurrence(item, today);
                return (
                  <Card key={item.id} style={styles.item}>
                    <View style={styles.itemMain}>
                      <Body tone="ink" numberOfLines={1} style={styles.itemName}>
                        {item.name}
                      </Body>
                      <Meta tone="ink3" numberOfLines={1}>
                        {occ
                          ? `${formatMD(occ.date)} · ${describeDays(occ.days)}`
                          : '日期不完整'}
                      </Meta>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`恢复 ${item.name}`}
                      onPress={() => void onRestore(item.id)}
                      style={({ pressed }) => [styles.restore, pressed && styles.restorePressed]}>
                      <Ionicons name="arrow-undo-outline" size={14} color={Palette.brand} />
                      <Label color={Palette.brand} style={styles.restoreText}>
                        恢复
                      </Label>
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`永久删除 ${item.name}`}
                      hitSlop={8}
                      onPress={() => onPurge(item)}
                      style={styles.purge}>
                      <Ionicons name="close" size={17} color={Palette.ink4} />
                    </Pressable>
                  </Card>
                );
              })}
            </View>

            <Button
              label="清空回收站"
              tone="danger"
              icon="trash-outline"
              onPress={onEmpty}
              style={styles.emptyAll}
            />
          </Gutter>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const useStyles = makeStyles((Palette) => ({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  spacer: { flex: 1 },
  empty: { fontSize: 13, fontWeight: '600', paddingHorizontal: Space.sm },

  list: { gap: Space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md },
  itemMain: { flex: 1, gap: 2 },
  itemName: { fontWeight: '500' },
  restore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Space.sm,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Palette.brandBg,
  },
  restorePressed: { opacity: 0.7 },
  restoreText: { fontSize: 11.5, fontWeight: '600' },
  purge: { padding: 2 },

  emptyAll: { marginTop: Space.xxl },
}));
