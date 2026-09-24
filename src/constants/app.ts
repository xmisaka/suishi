/**
 * 岁时 · 应用常量
 *
 * 版本号只有一个来源：app.json 里的 `expo.version`。
 *
 * 之前 mine / about 两页各自硬编码了一个 '0.1.0'，而 app.json 早已是 1.0.0 ——
 * 同一个事实写三遍，迟早会出现「设置页说 0.1.0、备份文件里写 v1.0.0」这种自相矛盾。
 */

import Constants from 'expo-constants';

export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';
