/**
 * 岁时 · 记一笔
 *
 * 这个应用唯一的核心动作。整个表单只问三件事：叫什么、哪天、怎么重复。
 * 其余（标记色、置顶、备注）都放在下面，不抢视线。
 *
 * 保存成功后回到星盘，而不是留在原地 —— 用户来这里是为了把一件事记下来，
 * 记完就该看见它亮在盘上。那个「亮了」的瞬间才是这个应用的价值，
 * 停在表单上弹一个「保存成功」的 toast 等于把这一步吞掉了。
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';

import EventForm from '@/components/domain/EventForm';
import { PageHeader, Screen } from '@/components/ui/layout';
import { useAppState } from '@/lib/store/app-state';

export default function ComposeScreen() {
  const router = useRouter();
  const { create } = useAppState();

  /*
   * 表单的重置开关。
   *
   * 标签页不会因为切走而卸载，所以「保存后离开、下次再进来」时，
   * 上一次的内容还留在输入框里。用 key 顶掉整个表单是最省事也最干净的做法：
   * 不需要在表单内部写一堆 setState 归零，也不会漏掉某个字段。
   *
   * 但刻意**不**在每次获得焦点时重置 —— 用户切去查个日期再回来，
   * 打了半截的名字不该没了。
   */
  const [formKey, setFormKey] = useState(0);

  return (
    <Screen>
      <PageHeader title="记一笔" subtitle="公历、农历，按年、按月、按周，都可以" />
      <EventForm
        key={formKey}
        submitLabel="记下来"
        onSubmit={async (draft) => {
          await create(draft);
          setFormKey((k) => k + 1);
          router.navigate('/');
        }}
      />
    </Screen>
  );
}
