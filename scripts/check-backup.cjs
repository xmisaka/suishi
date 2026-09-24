/**
 * 岁时 · 备份与恢复的边界校验
 *
 * 为什么要有这么一份东西：备份导入是**不可逆**的，而且它出错时不会报错 ——
 * 只会安静地把一份旧备份盖在新数据上，或者把用户刚删掉的条目复活。
 * 等到发现时，原本的数据已经没了。
 *
 * 所以这里把「文件长什么样」「坏数据怎么收敛」「谁覆盖谁」逐条断言，
 * 尤其是那条最容易踩的边界：**软删只写 deleted_at、不动 updated_at**，
 * 只看 updatedAt 的话，一份更旧的备份能把刚删掉的东西复活。
 *
 * 用法（先编译成 commonjs 再跑，TS 不能直接被 node 执行）：
 *
 *   node_modules/.bin/tsc -p scripts/tsconfig.backuptest.json
 *   node scripts/check-backup.cjs
 *
 * ★ 这里 require 的是 `src/lib/backup.ts` 真正的编译产物，不是复刻。
 *   断言通过 = 上机跑的就是这套逻辑。
 */

const path = require('path');

const OUT = path.join(__dirname, '..', '.workbuddy', 'tmp', 'backuptest');
const B = require(path.join(OUT, 'backup.js'));

/* ------------------------------------------------------------ 断言框架 */

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
  } else {
    failures.push(`${label}\n      期望 ${e}\n      实际 ${a}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 46 - title.length))}`);
}

/* ------------------------------------------------------------ 夹具 */

const KEYS = [
  'id',
  'name',
  'calendar',
  'repeat',
  'year',
  'month',
  'day',
  'leap',
  'weekday',
  'tone',
  'pinned',
  'note',
  'remindDays',
  'sortOrder',
  'createdAt',
  'updatedAt',
  'deletedAt',
];

function ev(over) {
  return Object.assign(
    {
      id: 't',
      name: '测试',
      calendar: 'solar',
      repeat: 'yearly',
      year: null,
      month: 1,
      day: 1,
      leap: false,
      weekday: null,
      tone: 'brand',
      pinned: false,
      note: null,
      remindDays: null,
      sortOrder: null,
      createdAt: 1000,
      updatedAt: 1000,
      deletedAt: null,
    },
    over,
  );
}

/** 只比较领域字段，绕开对象 key 顺序对 JSON.stringify 的影响 */
const pick = (e) => KEYS.map((k) => e[k]);
const pickAll = (list) => list.map(pick);

/**
 * 用**本地时间**构造时间戳。
 * formatStamp 走的是 getHours() 这类本地读数，直接写死 UTC 毫秒
 * 会让断言随运行机器的时区飘。
 */
const LOCAL_AT = new Date(2026, 8, 23, 15, 40, 0).getTime();
const NOW = LOCAL_AT + 86_400_000; // 「解析时刻」刻意与文件里的时间都不一样

/** 造一份备份 JSON 文本 */
function text(over) {
  return JSON.stringify(
    Object.assign(
      {
        kind: B.BACKUP_KIND,
        format: 1,
        app: '1.0.0',
        exportedAt: LOCAL_AT,
        counts: { active: 1, deleted: 0 },
        events: [ev({ id: 'a' })],
      },
      over,
    ),
  );
}

/* ============================================================ 一 · 文件形状 */

section('文件形状');

const three = [
  ev({ id: 'a', name: '生日', month: 9, day: 23 }),
  ev({ id: 'b', name: '中秋', calendar: 'lunar', month: 8, day: 15, leap: false, tone: 'amber', pinned: true }),
  ev({ id: 'c', name: '删掉的', deletedAt: 5000, updatedAt: 2000 }),
];

const built = B.buildBackup(three, '1.0.0', LOCAL_AT);
check('kind 是身份证', built.kind, B.BACKUP_KIND);
check('format 与当前版本一致', built.format, B.BACKUP_FORMAT);
check('条数小计分在册与回收站', built.counts, { active: 2, deleted: 1 });
check('导出时刻原样带出', built.exportedAt, LOCAL_AT);
check(
  '序列化后是可读的缩进 JSON',
  B.serializeBackup(built).includes('\n  "kind"'),
  true,
);
check(
  '文件名是纯 ASCII 且带日期',
  B.backupFileName(LOCAL_AT),
  'suishi-2026.09.23.json',
);

check('时间格式 · 正常', B.formatStamp(LOCAL_AT), '2026年9月23日 15:40');
check('时间格式 · 从未导出', B.formatStamp(null), '从未备份');
check('时间格式 · 零值当从未导出', B.formatStamp(0), '从未备份');
check('短时间格式', B.formatStampShort(LOCAL_AT), '2026.09.23');
check('短时间格式 · 从未导出', B.formatStampShort(null), '还没备份过');

/* ============================================================ 二 · 往返 */

section('往返 · 导出再导入，一条都不能变');

const trip = B.parseBackup(B.serializeBackup(built), NOW);
check('解析成功', trip.ok, true);
check('条数一致', trip.events.length, 3);
check('没有任何一条被判为坏数据', trip.malformed, 0);
check('逐字段一致（含农历、置顶、软删）', pickAll(trip.events), pickAll(three));
check('回收站条目也在备份里', trip.backup.counts, { active: 2, deleted: 1 });
check('导出方版本带回来', trip.backup.app, '1.0.0');

/* ============================================================ 三 · 拒读 */

section('拒读 · 认不出来的文件一律拦下');

const rejected = (t) => {
  const r = B.parseBackup(t, NOW);
  return r.ok ? 'ok' : r.error;
};

check('空文件', rejected(''), 'empty');
check('纯空白', rejected('   \n  '), 'empty');
check('不是 JSON', rejected('这不是 json'), 'not-json');
check('顶层是数组', rejected('[]'), 'not-json');
check('顶层是数字', rejected('42'), 'not-json');
check('JSON 但不是备份', rejected('{"hello":1}'), 'not-suishi');
check('别家应用的备份', rejected('{"kind":"gewu.backup","events":[]}'), 'not-suishi');
check(
  '来自更新版本的岁时',
  rejected(text({ format: B.BACKUP_FORMAT + 1 })),
  'format-too-new',
);
check('events 缺失', rejected(text({ events: undefined })), 'no-events');
check('events 是空数组', rejected(text({ events: [] })), 'no-events');
check('唯一一条连 id 都没有', rejected(text({ events: [{ name: '没 id' }] })), 'no-events');
check('每条错误都能说人话', B.BACKUP_ERROR_TEXT['format-too-new'].includes('更新'), true);

/* ============================================================ 四 · 坏字段收敛 */

section('收敛 · 坏字段退化成默认值，不丢整条');

const dirty = B.parseBackup(
  text({
    events: [
      ev({
        id: 'dirty',
        name: '  手改坏了  ',
        calendar: '阴历',
        repeat: '每天',
        month: 13,
        day: 0,
        tone: '紫',
        pinned: 1,
        weekday: 9,
        year: 3000,
        leap: 1,
        note: '   ',
        updatedAt: undefined,
        sortOrder: 3.7,
      }),
      { name: '连 id 都没有' },
      { id: 'only-id' },
    ],
  }),
  NOW,
);

check('解析仍然成功', dirty.ok, true);
check('两条立不住的被丢掉并计数', dirty.malformed, 2);
check('留下来的只有一条', dirty.events.length, 1);

const d = dirty.events[0];
check('名字去掉了首尾空白', d.name, '手改坏了');
check('历法瞎写 → 公历', d.calendar, 'solar');
check('周期瞎写 → 每年', d.repeat, 'yearly');
check('月超界 → 1', d.month, 1);
check('日越界 → 1', d.day, 1);
check('标记色瞎写 → brand', d.tone, 'brand');
check('置顶 1 → true', d.pinned, true);
check('星期越界 → null', d.weekday, null);
check('年份超界 → null', d.year, null);
check('闰月 1 → true', d.leap, true);
check('纯空白备注 → null', d.note, null);
check('排序取整', d.sortOrder, 4);
check(
  '★ 更新时间缺失时退化成创建时间，而不是「现在」',
  d.updatedAt,
  d.createdAt,
);
check('并且确实没被写成解析时刻', d.updatedAt === NOW, false);

const noTime = B.parseBackup(
  JSON.stringify({
    kind: B.BACKUP_KIND,
    events: [{ id: 'x', name: '没有时间戳' }],
  }),
  NOW,
);
check('时间戳全缺时创建时间取解析时刻兜底', noTime.events[0].createdAt, NOW);
check('更新时间跟着创建时间走', noTime.events[0].updatedAt, NOW);

/* ============================================================ 五 · 合并 */

section('合并 · 谁覆盖谁');

const local = [
  ev({ id: 'keep', updatedAt: 1000 }),
  ev({ id: 'older', updatedAt: 5000 }),
  ev({ id: 'newer', updatedAt: 1000 }),
  ev({ id: 'same', updatedAt: 3000 }),
];

const incoming = [
  ev({ id: 'keep', updatedAt: 1000 }), // 一模一样 → 跳过
  ev({ id: 'older', updatedAt: 4000 }), // 备份更旧 → 跳过
  ev({ id: 'newer', updatedAt: 9000 }), // 备份更新 → 覆盖
  ev({ id: 'same', updatedAt: 3000 }), // 一模一样 → 跳过
  ev({ id: 'brand-new', updatedAt: 1 }), // 本地没有 → 新增
];

const plan = B.planMerge(incoming, local);
check('新增 · 本地没有的', plan.insert.map((e) => e.id), ['brand-new']);
check('覆盖 · 备份更新的', plan.update.map((e) => e.id), ['newer']);
check(
  '跳过 · 相同或更旧的',
  plan.skip.map((e) => e.id),
  ['keep', 'older', 'same'],
);
check('三条之和等于备份条数', plan.insert.length + plan.update.length + plan.skip.length, 5);

/* ============================================================ 六 · 幂等 */

section('幂等 · 同一份文件导入两次，第二次应当什么都不做');

/** 模拟落盘：把计划里要写的合并进现有数据 */
function applyPlan(existing, p) {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of [...p.insert, ...p.update]) byId.set(e.id, e);
  return [...byId.values()];
}

const afterFirst = applyPlan(local, plan);
const second = B.planMerge(incoming, afterFirst);
check('第二次没有新增', second.insert.length, 0);
check('第二次没有覆盖', second.update.length, 0);
check('第二次全部跳过', second.skip.length, 5);
check('数据条数没变多', afterFirst.length, local.length + 1);

/* ============================================================ 七 · 软删边界 */

section('软删边界 · 刚删掉的不该被旧备份复活');

// 本地：三天前编辑过，今天删了 → updatedAt 旧、deletedAt 新
const justDeleted = ev({ id: 'z', updatedAt: 3000, deletedAt: 9000 });
// 备份：昨天导出的，那时它还在册 → updatedAt 5000、deletedAt 空
const backupHasIt = ev({ id: 'z', updatedAt: 5000, deletedAt: null });

const keepDeleted = B.planMerge([backupHasIt], [justDeleted]);
check('备份更旧 → 跳过，不复活', keepDeleted.skip.map((e) => e.id), ['z']);
check('没有产生覆盖', keepDeleted.update.length, 0);

// 反向：备份里把它删了，而且删得比本地这次编辑更晚 → 照实移进回收站
const backupDeletedIt = ev({ id: 'z', updatedAt: 3000, deletedAt: 12_000 });
const bringDeletion = B.planMerge([backupDeletedIt], [ev({ id: 'z', updatedAt: 5000, deletedAt: null })]);
check('备份里的删除更晚 → 覆盖', bringDeletion.update.map((e) => e.id), ['z']);
check('覆盖后的状态是「已删除」', bringDeletion.update[0].deletedAt, 12_000);

/* ============================================================ 汇总 */

console.log(`\n${'='.repeat(54)}`);
if (failures.length === 0) {
  console.log(`全部通过：${passed} 项断言`);
  process.exit(0);
} else {
  console.log(`通过 ${passed} 项，失败 ${failures.length} 项：\n`);
  for (const f of failures) console.log(`  ✗ ${f}\n`);
  process.exit(1);
}
