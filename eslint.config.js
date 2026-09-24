// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {      /*
       * React Compiler 的 immutability 规则不认识 Reanimated 的共享值。
       *
       * `useSharedValue()` 返回的是带**可变** `.value` 的对象 ——
       * 在 worklet 里写 `rotation.value += delta` 正是它的既定用法。
       * 但编译器把 hook 的返回值一律当成不可变，于是每一处赋值都报
       * 「This value cannot be modified」。星盘的拖动、吸附、点击跳转
       * 四处全中，而它们本身没有任何问题。
       *
       * 只关这一条：`react-hooks` 的其它规则照常生效，
       * exhaustive-deps 仍然拦得住依赖写漏（本项目已经靠它拦过一次扫弧重放）。
       *
       * 撤回时机：Reanimated 给出 compiler 友好的共享值 API，
       * 或该规则学会识别 useSharedValue。
       */
      "react-hooks/immutability": "off",
    },
  },
  {
    /*
     * scripts/ 下全是 node 脚本（.cjs）。
     *
     * expo 的 flat config 认的是浏览器与 RN 的全局，不认识 CommonJS 的
     * __dirname / __filename，于是 build-apk.cjs、check-calendar.cjs、
     * dial-preview.cjs 每一个都报一条 `no-undef` ——
     * 报错是真的，但错在配置而不在代码：这几个脚本都跑得好好的。
     * 顺手补齐，免得以后有人把这几条当线索去查一个不存在的 bug。
     */
    files: ["scripts/**/*.{js,cjs}"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
        require: "readonly",
        module: "writable",
        exports: "writable",
        process: "readonly",
        console: "readonly",
      },
    },
  },
]);
