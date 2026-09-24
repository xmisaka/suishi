/**
 * lunar-javascript 的本地环境类型声明。
 *
 * 这个库不带 `.d.ts`（package.json 里只有 `main: index.js`），而工程开了 `strict`，
 * 不补声明 `import` 就会报 TS2307、回调参数也会退化成隐式 any。
 *
 * 刻意**只声明我们用到的那些方法**，不是照抄一份完整 API：
 *   - 覆盖多了，将来库改了名字我们不会发现
 *   - 覆盖少了，编译器会当场报错，正好逼着人来这里补
 *
 * 调用面唯一的出口是 `src/lib/calendar/lunar.ts` —— 那里是唯一 import 本模块的文件。
 * 想核对真实签名，用 node 直接内省：
 *
 *     node -e "const l=require('lunar-javascript');
 *              console.log(Object.getOwnPropertyNames(l.Lunar.fromYmd(2026,8,15)))"
 */
declare module 'lunar-javascript' {
  /** 公历日期实例。库内部是对象字面量，方法挂在实例自身上 */
  export interface SolarInstance {
    getYear(): number;
    /** 1–12 */
    getMonth(): number;
    /** 1–31 */
    getDay(): number;
    getLunar(): LunarInstance;
  }

  /** 农历日期实例 */
  interface LunarInstance {
    /** 农历年 */
    getYear(): number;
    /** 农历月；**闰月为负数**，与同月号的平月共用绝对值 */
    getMonth(): number;
    /** 农历日；大月 1–30，小月 1–29 */
    getDay(): number;
    getSolar(): SolarInstance;
    /** 农历年的干支，如「丙午」 */
    getYearInGanZhi(): string;
    /** 农历年的生肖，如「马」 */
    getYearShengXiao(): string;
    /**
     * 二十四节气表。两个坑，用之前必须知道：
     *
     *   1. **以冬至为年头**。一张表覆盖「anchorYear−1 的冬至 → anchorYear 的大雪」，
     *      跨两个公历年。想取「今天之后的二分二至」往往要翻相邻的几张表。
     *   2. **同名节气出现两次**：中文键是本轮的（如 `冬至` = 去年 12 月），
     *      大写拼音键是下一轮的（`DONG_ZHI` = 今年 12 月）。
     *      键总数是 26 而非 24，不要 `Object.keys().length === 24` 这种假设。
     */
    getJieQiTable(): Record<string, SolarInstance>;
  }

  /** 某一个农历月（不展开整年） */
  interface LunarMonthInstance {
    getYear(): number;
    /** 闰月为负 */
    getMonth(): number;
    /** 该月天数：29 或 30 */
    getDayCount(): number;
    isLeap(): boolean;
  }

  interface LunarYearInstance {
    /** 该农历年的闰月月号；**无闰月返回 0** */
    getLeapMonth(): number;
    /** 该农历年的干支，如「丙午」 */
    getGanZhi(): string;
    /**
     * **注意**：返回 15 个月，含上一年的冬月/腊月与次年的正月，
     * 不能直接当月历用。取某年某月请用 `LunarMonth.fromYm`。
     */
    getMonths(): LunarMonthInstance[];
  }

  export const Solar: {
    fromYmd(year: number, month: number, day: number): SolarInstance;
  };

  export const Lunar: {
    /** `month` 传负数表示闰月；该闰月不存在时会**抛异常** */
    fromYmd(year: number, month: number, day: number): LunarInstance;
  };

  export const LunarMonth: {
    /** `month` 传负数表示闰月；该闰月不存在时会**抛异常**，调用前必须先判存在 */
    fromYm(year: number, month: number): LunarMonthInstance;
  };

  export const LunarYear: {
    fromYear(year: number): LunarYearInstance;
  };
}
