/**
 * 岁时 · 全部
 *
 * 按「还有多久」分段呈现，而不是按创建时间或首字母。
 *
 * 为什么分段而不是一张长表：一年里几十个日子平铺下来，用户看不出
 * 「哪些是眼下要准备的、哪些还远」。分段把时间距离变成视觉距离 ——
 * 一眼就知道该往下翻多远。
 *
 * 已过去的另起一段并压到最后：它们不再是提醒，而是存档。
 */

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import EventRow from '@/components/domain/EventRow';
import { Card, Gutter, PageHeader, Screen } from '@/components/ui/layout';
import { Chip, SearchField } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/feedback';
import { Label, Meta } from '@/components/ui/typography';
import { GUTTER, Palette, Space } from '@/constants/theme';
import { formatLunar } from '@/lib/date';
import { useAppState } from '@/lib/store/app-state';
import type { Anniversary, Occurrence } from '@/lib/types';
import { makeStyles } from '@/lib/theme';

/* ------------------------------------------------------------ 分段定义 */

interface Bucket {
  key: string;
  label: string;
  from: number;
  to: number;
}

const BUCKETS: Bucket[] = [
  { key: 'today', label: '今天', from: 0, to: 0 },
  { key: 'week', label: '一周之内', from: 1, to: 7 },
  { key: 'month', label: '一个月内', from: 8, to: 30 },
  { key: 'quarter', label: '三个月内', from: 31, to: 100 },
  { key: 'year', label: '一年之内', from: 101, to: 366 },
  { key: 'far', label: '一年之后', from: 367, to: Number.POSITIVE_INFINITY },
];

const PAST_KEY = 'past';

type CalendarFilter = 'all' | 'solar' | 'lunar';

/* ------------------------------------------------------------ 页 */

export default function ListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { occurrences, eventById, events } = useAppState();
  const styles = useStyles();

  const [keyword, setKeyword] = useState('');
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>('all');

  const sections = useMemo(() => {
    const kw = keyword.trim().toLowerCase();

    const kept = occurrences.filter((o) => {
      const ev = eventById.get(o.id);
      if (!ev) return false;
      if (calendarFilter !== 'all' && ev.calendar !== calendarFilter) return false;
      if (!kw) return true;
      const haystack = [
        ev.name,
        ev.note ?? '',
        formatLunar(o.lunar ?? { y: 0, m: 0, d: 0, leap: false }),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(kw);
    });

    const buckets = new Map<string, Occurrence[]>();
    for (const o of kept) {
      const key = o.expired ? PAST_KEY : (BUCKETS.find((b) => o.days >= b.from && o.days <= b.to)?.key ?? 'far');
      const list = buckets.get(key);
      if (list) list.push(o);
      else buckets.set(key, [o]);
    }

    const out = BUCKETS.filter((b) => buckets.has(b.key)).map((b) => ({
      title: b.label,
      data: buckets.get(b.key)!,
    }));

    const past = buckets.get(PAST_KEY);
    if (past && past.length > 0) {
      // 已过去的按「最近过去的排前面」，与未来段的方向感一致：都朝今天靠
      out.push({ title: '已经过去', data: [...past].sort((a, b) => b.days - a.days) });
    }
    return out;
  }, [occurrences, eventById, keyword, calendarFilter]);

  const total = sections.reduce((n, s) => n + s.data.length, 0);

  const open = (id: string) => router.push({ pathname: '/event/[id]', params: { id } });

  return (
    <Screen>
      <PageHeader
        title="全部"
        subtitle={
          events.length === 0
            ? '还没有记下任何日子'
            : total === events.length
              ? `共 ${events.length} 个日子`
              : `${total} / ${events.length} 个日子`
        }
      />

      {events.length > 0 ? (
        <>
          <SearchField
            value={keyword}
            onChange={setKeyword}
            placeholder="搜索名字、备注、农历日期"
          />
          <View style={styles.filters}>
            <Chip
              label="全部"
              selected={calendarFilter === 'all'}
              onPress={() => setCalendarFilter('all')}
            />
            <Chip
              label="公历"
              selected={calendarFilter === 'solar'}
              onPress={() => setCalendarFilter('solar')}
            />
            <Chip
              label="农历"
              selected={calendarFilter === 'lunar'}
              onPress={() => setCalendarFilter('lunar')}
            />
          </View>
        </>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        renderSectionHeader={({ section }) => (
          <Gutter>
            <View style={styles.sectionHead}>
              <Label tone="ink2" style={styles.sectionLabel}>
                {section.title}
              </Label>
              <Meta tone="ink4">{section.data.length}</Meta>
            </View>
          </Gutter>
        )}
        renderItem={({ item, index, section }) => {
          const ev: Anniversary | undefined = eventById.get(item.id);
          if (!ev) return null;
          return (
            <Card padded={false} style={styles.card}>
              <EventRow
                event={ev}
                occurrence={item}
                last={index === section.data.length - 1}
                onPress={() => open(item.id)}
              />
            </Card>
          );
        }}
        ListEmptyComponent={
          events.length === 0 ? (
            <EmptyState
              title="还没有记下任何日子"
              description="生日、结婚纪念、节气、发薪日 —— 都可以。"
              actionLabel="记一笔"
              onAction={() => router.push('/compose')}
            />
          ) : (
            <EmptyState icon="search-outline" title="没有匹配的日子" description="换个词，或把筛选切回「全部」。" />
          )
        }
      />
    </Screen>
  );
}

const useStyles = makeStyles((Palette) => ({
  filters: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: GUTTER,
    paddingTop: Space.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Space.xxl,
    paddingBottom: Space.sm,
  },
  sectionLabel: { fontSize: 12.5, letterSpacing: 0.6 },
  /* SectionList 的每一行都是独立卡片，靠 marginBottom 分开而不是画分隔线 */
  card: { marginHorizontal: GUTTER, marginBottom: Space.sm, borderColor: Palette.line3 },
}));
