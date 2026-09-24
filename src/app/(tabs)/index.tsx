/**
 * 岁时 · 星盘（首页）
 *
 * 这一屏只做一件事：把一年摊成一张圆盘。
 *
 * 层次从上到下：
 *   页头   今天的农历日期与干支年 —— 这是本应用「以农历为底」的第一处表态
 *   圆盘   全部内容，见 components/domain/SkyDial
 *   计数   今天 / 将到 / 还早 三档数量，用来核对盘上没有漏画
 *   近事   接下来五个日子。圆盘回答「一年有多满」，这一段回答「最近是谁」
 *
 * 空白状态不藏圆盘：空盘本身就是引导（圆心写着「点下方 ＋ 记一笔」），
 * 换成一个居中的插画会把「这里将来会有一张盘」这个预期抹掉。
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EventRow from '@/components/domain/EventRow';
import SkyDial from '@/components/domain/SkyDial';
import { Button } from '@/components/ui/controls';
import { EmptyState, LegendStrip, Loading } from '@/components/ui/feedback';
import { Card, Gutter, PageHeader, Screen, ScreenScroll } from '@/components/ui/layout';
import { Label, Meta } from '@/components/ui/typography';
import { GUTTER, Palette, Space } from '@/constants/theme';
import { lunarYearGanZhi, solarToLunar } from '@/lib/calendar/lunar';
import { dialWorthy } from '@/lib/calendar/resolve';
import { formatLunar } from '@/lib/date';
import { useAppState } from '@/lib/store/app-state';
import { makeStyles } from '@/lib/theme';
import { countToneOf } from '@/lib/tone';

/** 圆盘下方列几个日子 */
const UPCOMING_COUNT = 5;

export default function SkyScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { occurrences, eventById, events, today, loading } = useAppState();

  const dialSize = Math.min(width - GUTTER * 2, 340);

  const onDial = useMemo(() => dialWorthy(occurrences), [occurrences]);
  const upcoming = useMemo(() => occurrences.filter((o) => !o.expired), [occurrences]);

  const todayLunar = useMemo(() => solarToLunar(today), [today]);

  /* 三档计数。刻意只数盘上的 —— 与圆盘所见严格一致，对不上就是画错了 */
  const legend = useMemo(() => {
    let today_ = 0;
    let soon = 0;
    let future = 0;
    for (const o of onDial) {
      const t = countToneOf(o.days);
      if (t === 'today') today_ += 1;
      else if (t === 'soon') soon += 1;
      else future += 1;
    }
    return [
      { tone: 'today' as const, label: '今天', count: today_ },
      { tone: 'soon' as const, label: '将到', count: soon },
      { tone: 'future' as const, label: '还早', count: future },
    ];
  }, [onDial]);

  const open = (id: string) => router.push({ pathname: '/event/[id]', params: { id } });

  return (
    <Screen>
      <ScreenScroll bottomInset={110 + insets.bottom}>
        <PageHeader
          title="岁时"
          subtitle={`农历${formatLunar(todayLunar)} · ${lunarYearGanZhi(todayLunar.y)}年`}
        />

        <View style={styles.dialWrap}>
          <SkyDial
            occurrences={onDial}
            eventById={eventById}
            today={today}
            size={dialSize}
            onOpen={open}
          />
        </View>

        {loading && events.length === 0 ? (
          <Loading />
        ) : events.length === 0 ? (
          <EmptyState
            title="星盘还是空的"
            description="记下第一个日子，它就会亮在这张盘上。"
            actionLabel="记一笔"
            onAction={() => router.push('/compose')}
          />
        ) : (
          <>
            <LegendStrip items={legend} />

            <View style={styles.section}>
              <Gutter>
                <View style={styles.sectionHead}>
                  <Label tone="ink2" style={styles.sectionLabel}>
                    接下来的日子
                  </Label>
                  <Label
                    color={Palette.brand}
                    style={styles.sectionLink}
                    onPress={() => router.push('/list')}>
                    全部 {occurrences.length} 个
                  </Label>
                </View>
              </Gutter>

              <Card padded={false} style={styles.card}>
                {upcoming.slice(0, UPCOMING_COUNT).map((o, i, arr) => {
                  const ev = eventById.get(o.id);
                  if (!ev) return null;
                  return (
                    <EventRow
                      key={o.id}
                      event={ev}
                      occurrence={o}
                      last={i === arr.length - 1}
                      onPress={() => open(o.id)}
                    />
                  );
                })}

                {upcoming.length === 0 ? (
                  <View style={styles.noneLeft}>
                    <Ionicons name="checkmark-done-outline" size={18} color={Palette.ink3} />
                    <Meta tone="ink3">没有待到的日子了</Meta>
                  </View>
                ) : null}
              </Card>

              {upcoming.length > UPCOMING_COUNT ? (
                <Gutter>
                  <Button
                    label={`还有 ${upcoming.length - UPCOMING_COUNT} 个日子`}
                    tone="secondary"
                    icon="chevron-down"
                    onPress={() => router.push('/list')}
                    style={styles.more}
                  />
                </Gutter>
              ) : null}
            </View>

            <Meta tone="ink4" style={styles.tip}>
              拖动圆盘可换个日子看，点盘上的光点会转到它。
            </Meta>

            {/* 今天若有到期条目，页头副标题之外的这一行是唯一的强调处 */}
            {legend[0].count > 0 ? (
              <Gutter>
                <Meta color={Palette.brand} style={styles.todayNote}>
                  今天有 {legend[0].count} 个日子。
                </Meta>
              </Gutter>
            ) : null}
          </>
        )}
      </ScreenScroll>
    </Screen>
  );
}

const useStyles = makeStyles((Palette) => ({
  dialWrap: { alignItems: 'center', paddingTop: Space.xs },
  section: { marginTop: Space.xxl },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Space.sm,
  },
  sectionLabel: { fontSize: 12.5, letterSpacing: 0.6 },
  sectionLink: { fontSize: 12, fontWeight: '600' },
  card: { marginHorizontal: GUTTER },
  noneLeft: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xxl },
  more: { marginTop: Space.md },
  tip: { textAlign: 'center', marginTop: Space.xl, fontSize: 11.5 },
  todayNote: { textAlign: 'center', marginTop: Space.sm, fontWeight: '600' },
}));
