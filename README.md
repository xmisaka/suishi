# 岁时 · 天象纪念日

把一年摊成一张盘，让每一个该记住的日子自己亮起来。

纯本地运行的 Android App：**不联网、不注册、无云端**，数据全部存在手机里。
公历与农历并排同行 —— 这是岁时存在的理由。

---

## 界面

四屏主标签，外加三个从属页。

### 一 · 星盘（首页）

一屏只做一件事：把一年摊成一张圆盘。

<p align="center">
  <img src="岁时-月轮-玄夜特写.png" width="420" alt="天象盘 · 玄夜主题 · 月轮特写" />
</p>

- **盘面** —— 三层同心实心圆做纵深（不画渐变，见下），刻度、节气扇区、星野、时间光带依次叠上去。
- **时间光带** —— 环本身就是光带，十二段对应十二个月，段中各一枚公历月号；
  位置随盘转，但每枚数字绕自己的中心反向自转，字面永远朝上。
- **焦点** —— 点选的条目落在环上的光点，带同色辉光与三环呼吸。圆盘可拖动旋转切换焦点。
- **四道分至点刻** —— 春分 / 夏至 / 秋分 / 冬至的角度由 `nextSolarTerms()` 实算，
  不是 `0/90/180/270`。
- **下面两段** —— 计数（今天 / 将到 / 还早）用来核对盘上没有漏画；
  「近事」列出接下来五个日子。圆盘回答「一年有多满」，这一段回答「最近是谁」。
- 空白状态**不藏圆盘**：空盘本身就是引导，换成一个居中插画会把「这里将来会有一张盘」的预期抹掉。

### 二 · 记一笔

这个应用唯一的核心动作。整个表单只问三件事：**叫什么、哪天、怎么重复**。
其余（标记色、置顶、备注）都放在下面，不抢视线。

保存成功后回到星盘，而不是留在原地 —— 用户来这里是为了把一件事记下来，
记完就该看见它亮在盘上。那个「亮了」的瞬间才是这个应用的价值。

### 三 · 全部

按「还有多久」分段呈现，而不是按创建时间或首字母。一年里几十个日子平铺下来，
用户看不出「哪些是眼下要准备的、哪些还远」；分段把时间距离变成视觉距离。
已过去的另起一段并压到最后：它们不再是提醒，而是存档。

### 四 · 我的

一屏装完所有「关于这台设备上怎么看」与「关于这份数据」的事，分四组：
概览（三个数字，用来核对数据还在）／外观（主题）／数据（回收站、清空全部）／关于（版本、来由）。

主题刻意做成**带色块的长列表**而不是一行 chips —— 四套主题的差别主要在
「底色有多暗、金是暖还是冷」，摊开两个色块比只写名字选得准得多。

| 主题 | 说明 |
|---|---|
| **玄夜** `xuanye` | 默认。最暗的一套，星盘的主场 |
| **苍青** `cangqing` | 墨底偏冷 |
| **墨玉** `moyu` | 墨底偏绿 |
| **素笺** `sujian` | 唯一的浅色档，留给白天 |

**不跟随系统深色。** 本应用的主界面是一枚星盘，浅色档下它只是张统计图；
跟随系统会让同一个应用在白天和夜里变成两个东西。选择权交给用户，默认停在玄夜。

### 从属页

- **条目详情** —— 大号倒计时占住上半屏，下面才是公历、农历、周期、备注这些事实。
  公历与农历**两个都列出来**，不管当初是用哪个历法建的：农历条目要能看到它今年落在
  公历哪天，公历条目也要能看到对应农历几月几。
- **回收站** —— 删除一律是软删，所以必须有这一屏。恢复放在主操作位，
  彻底删除放在次位且要二次确认：来这一屏的人，绝大多数是来找回东西的。
- **备份与恢复** —— 见下。
- **关于** —— 一页书卷气的说明，刻意写得像序，不像产品介绍。

---

## 历法：农历条目为什么存原始值

农历一旦公历化，就会逐年失真 —— 今年八月十五是 9 月 25 日，明年不是。
所以库里的农历条目**只存原始农历值**（年 / 月 / 日 / 是否闰月），
换算出的公历日期只在运行时算，**不落库**。

配套的是三条硬约定：

1. **历法与周期规则的解析是纯函数** —— 不碰数据库、不碰 React、不读系统时间，
   「今天」一律作为参数传入。这样八种「历法 × 周期」组合才能逐条断言。
2. **存语义色键而非色值** —— 存色值换肤后会花。
3. **日期用纯数字三元组，不用 `Date`** —— `Date` 带时区、带本地化，还是可变对象，
   跨月跨年的加减容易踩到夏令时。

周期规则四档：`once` / `yearly` / `monthly` / `weekly`。
边界情况在解析层钳住：公历 2 月 29 日在非闰年钳到 28，31 号在小月钳到月末。

---

## 数据：备份与恢复

- **导出** = 写一个 JSON 到缓存目录，再交给**系统分享面板**。用户想放哪就放哪
  （文件管理器、网盘、发微信给自己、发邮件），应用不替他决定。
- **导入** = 选文件 → **先看再动**。先弹一张预览，把导出时间、条数、文件名摊开，
  再让用户选「合并」还是「替换」。面板本身就是第一道确认，「替换」还要再过一道红色
  Alert —— 导入不可逆，不该点一下就落地。
- **合并** = 同 id 保留改动较新者，重复导入幂等。
  ★ 「最后一次被改动的时刻」取 `max(updatedAt, deletedAt ?? 0)` ——
  软删只写 `deleted_at`、不动 `updated_at`，只看 `updatedAt` 的话，
  一份更旧的备份能把**刚删掉**的条目复活。
- 写库一律在**单事务**里，「替换」的 `DELETE FROM events` 也在同一个事务内 ——
  拆成两个事务，中途失败剩下的就是一个空库。
- 备份**含回收站条目**、**不含界面偏好**（偏好属于「在这台设备上怎么看」，
  不属于「我的日子」）。

---

## 技术栈

Expo SDK 57 / React Native，**不是** Flutter 也**不是**原生。

| | |
|---|---|
| 框架 | Expo SDK 57 + expo-router（`typedRoutes` + `reactCompiler`） |
| RN / React | react-native 0.86.3 / React 19.2.3 |
| 语言 | TypeScript 6（`strict`） |
| 动画 | Reanimated 4.5.1 + react-native-worklets 0.10.1 —— 全部走 UI 线程 |
| 数据库 | expo-sqlite（一张主表 `events` + 一张 `meta`） |
| 图形 | react-native-svg 15.15.4 |
| 农历 | lunar-javascript 1.7.7 |
| 状态 | 自建 Context（`src/lib/store/app-state.tsx`）—— 状态就是「一列纪念日 + 今天」，不值得再上一层 redux/zustand |

**动画全部在 UI 线程。** JS 线程不参与逐帧计算。
代价是一条容易踩的坑：worklet 里被**同步调用**的 helper 必须自带 `'worklet'` 指令，
否则 worklets 会把它包成 remote function，UI 线程同步调它必抛
`Tried to synchronously call a Remote Function`；release 包里没有红屏、进程直接终止，
看着像原生崩溃。定位工具：`node scripts/inspect-worklets.cjs <文件>`。

---

## 工程结构

```
src/
  app/                       expo-router 路由
    (tabs)/                  index 星盘 / list 全部 / compose 记一笔 / mine 我的
    event/[id]/              详情 + edit
    backup.tsx  trash.tsx  about.tsx
  components/
    domain/                  SkyDial（星盘）、EventForm、EventRow、DatePickerModal
    ui/                      layout / typography / controls / feedback / sheet
  lib/
    dial.ts                  ★ 星盘的几何与视觉参数（纯函数 + 纯常量）
    calendar/                lunar 换算、resolve 解析、describe 文案
    db/                      schema / index / events / prefs
    theme/                   主题运行时（代理 + 样式工厂 + 订阅）
    backup.ts                ★ 纯函数，now 由调用方传入
    coerce.ts                ★ 不可信值的白名单，读库与读备份共用
    tone.ts                  距今天数 → 四档色调，全应用只此一处
    date.ts  format.ts  id.ts  types.ts
  constants/
    theme.ts                 设计令牌 + 四套主题
    app.ts                   版本号唯一来源（读 expo.version）
scripts/                     校验、出图、构建
android/                     已 prebuild 的原生工程（入库）
```

两条结构上的选择值得说明：

- **星盘的几何与视觉参数在 `src/lib/dial.ts`，组件只留组件。** `SkyDial.tsx` 只剩
  「React + 手势 + 动画」。抽出来的理由不是「组件太长」，而是**可验证** ——
  盘上到底画成什么样，原先只能装到手机上看；现在 `scripts/dial-preview.cjs`
  直接编译同一模块、用同一套函数出图，调星野密度或光带梯度时先看图再改组件。
  ★ 例外：`norm360` 带 `'worklet'` 指令、被 UI 线程同步调用，刻意留在组件文件里。
- **不可信值的白名单只有一处：`src/lib/coerce.ts`。** 读库行与读备份文件共用它 ——
  两边各写一份的话，迟早分叉出「库里认、导入不认」这种谁也说不清的 bug。

---

## 校验

农历换算与「下一次是哪天」这两件事，出错时**不会报错**，只会安静地算出一个错误的日子。
用户在若干年后才发现某条纪念日偏了一天 —— 那时候已经无从追查。所以关键逻辑都有断言：

```bash
# 历法与周期规则的边界（八种组合）
node_modules/.bin/tsc -p scripts/tsconfig.caltest.json && node scripts/check-calendar.cjs

# 备份往返 / 拒读 / 坏字段收敛 / 合并 / 幂等 / 软删边界
node_modules/.bin/tsc -p scripts/tsconfig.backuptest.json && node scripts/check-backup.cjs

# 月轮：遍历 730 个起始日，断言段数恒 12 / 月号序列 / 角度递增 / 不越段 / 不碰撞
node scripts/check-month-ring.cjs

# 出图核对：无头 Chrome 截 900×900
node scripts/dial-preview.cjs --plate xuanye
```

圆盘同心的色差有个反直觉的判据：**外圈敢拉开、内圈必须收住** ——
同等的色差落在半径小的圈上更容易读成硬边。三层盘面 bed 相邻只差 2~4 级。
这类问题在 340px 的小图上看不出来，**必须看 900px 特写**。

---

## 本地运行

```bash
npm install
npm start -- --lan     # 或双击 start-dev.cmd
```

用 Expo Go 扫码即可预览。

### 出 Android 安装包

```bash
node scripts/prebuild-android.cjs     # 仅首次
node scripts/patch-android.cjs        # prebuild 后必套
node scripts/gen-keystore.cjs         # 仅一次，生成 release 签名密钥
node scripts/build-apk.cjs            # 出包（耗时较长，建议后台跑）
```

构建前需要两份**不入库**的本地文件，模板已在仓库里：

```bash
cp android/key.properties.example   android/key.properties    # 填签名口令
cp android/local.properties.example android/local.properties  # 填本机 Android SDK 路径
```

> ⚠️ 缺失 `key.properties` 时构建**不会中断**，会静默回落到 debug 签名 ——
> 打出来的包无法覆盖安装已发布的版本，务必确认签名生效。

---

## 版本

当前 **v1.2.0**（versionCode 3）。

| 版本 | 内容 |
|---|---|
| v1.2.0 | App 图标去掉细环、字收小一档；启动图 `imageWidth` 132 → 194 |
| v1.1.0 | 新增备份与恢复；换新图标与启动画面 |
| v1.0.0 | 首版 |

---

## 授权

MIT，见 [LICENSE](LICENSE)。
