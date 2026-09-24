/**
 * 岁时 · 编辑
 *
 * 与「记一笔」共用 EventForm，只是把初始值灌进去。
 * 保存后回到详情页 —— 用户是从那里点进来的，改完就该看到改后的样子。
 */

import { useLocalSearchParams, useRouter } from 'expo-router';

import EventForm from '@/components/domain/EventForm';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader, Screen, ScreenScroll } from '@/components/ui/layout';
import { useAppState } from '@/lib/store/app-state';

export default function EditEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { eventById, update } = useAppState();

  const event = id ? eventById.get(id) : undefined;

  if (!event) {
    return (
      <Screen>
        <ScreenScroll>
          <EmptyState
            icon="help-circle-outline"
            title="这条日子不见了"
            description="它可能已经被删掉了。"
            actionLabel="返回"
            onAction={() => router.back()}
          />
        </ScreenScroll>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="编辑" subtitle={event.name} />
      <EventForm
        initial={event}
        submitLabel="保存修改"
        onSubmit={async (draft) => {
          await update(event.id, draft);
          router.back();
        }}
      />
    </Screen>
  );
}
