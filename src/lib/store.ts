// 本地持久化：工作台各模块（自选以外的）统一走这里的 JSON 存储。
//
// 设计取舍（2026-10-21）：
// - 纯静态站点（GitHub Pages）没有后端，持仓 / 模拟盘 / 回测参数全部落 localStorage；
// - 统一 `loadJSON/saveJSON` + `usePersistentState`，避免每个模块各写一遍 try/catch；
// - 隐私模式 / 配额满时静默降级为内存态（读返回 fallback，写吞异常），页面不至于白屏。

const PREFIX = 'xuangu.workbench.';

/** 读取并反序列化；不存在、损坏、隐私模式都返回 fallback（若给的是函数则调用取默认值） */
export function loadJSON<T>(key: string, fallback: T | (() => T)): T {
  const def = typeof fallback === 'function' ? (fallback as () => T)() : fallback;
  try {
    if (typeof localStorage === 'undefined') return def;
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return def;
    return JSON.parse(raw) as T;
  } catch {
    return def;
  }
}

/** 序列化写入；失败（配额满 / 隐私模式）静默忽略，不阻断交互 */
export function saveJSON<T>(key: string, value: T): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    }
  } catch {
    /* 静默降级 */
  }
}

export function removeKey(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(PREFIX + key);
  } catch {
    /* 静默降级 */
  }
}

/** 稳定的自增 id：优先 randomUUID，老环境降级时间戳+随机 */
export function newId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
