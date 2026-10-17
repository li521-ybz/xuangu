// 模块④ 条件选股引擎（纯函数，无 IO）：涨停回调策略 + 分钟级买点
// 口径来源：用户 2026-10-17 拍板稿（知识库 产品/选股.md §8 为需求权威），实现口径：
//   主条件（日K，均按开关启用，全部 AND）：
//     1. 涨停后 3–10 交易日内（取窗口内最近一个涨停日 T 作锚点）
//     2. 缩量：T+1 至最新一日内，有任一交易日成交量 ≤ max(涨停日量, 次日量) × 55%
//     3. 不破首板最低价：T+1 至最新一日内最低价均 ≥ 涨停连续段首板日最低价（连板取第一个涨停日；2026-10-17 21:36 由「不破涨停最低点」修改）
//     4. 不破 20 日线：T+1 至最新一日内每日收盘价均 > 当日 MA20
//   买点条件（按距涨停日数自动分支，与主条件 AND；口径：用户 2026-10-17 21:09 澄清）：
//     5. 最新收盘 > MA10（日K）
//     6. 30 分 BOLL(45,2) 带宽近 3 根持续下降（缩口）——两分支同参数
//     7. 距涨停 ≤6 日：仅 30 分 MA13 上穿 MA25（5 根内）
//        距涨停 >6 日：30 分 MA13 上穿 MA25（5 根内）＋ 60 分 MA13 上穿 MA25（5 根内）
// 已知限制：日K 为前复权（qfq），窗口内遇除权时涨停识别可能漏检（v1 接受，见开发计划）。
import type { Candle } from '../../lib/types';
import { movingAverage } from '../chart/ma';

/** 涨停识别容差（百分点）：前复权价格四舍五入与除权噪声的缓冲 */
export const LIMIT_UP_TOLERANCE = 0.2;
/** 缩量判定：成交量 ≤ 基准量（涨停日/次日最高量）× 该比例 */
export const SHRINK_RATIO = 0.55;
/** 涨停后窗口 [min, max] 交易日 */
export const WINDOW_MIN = 3;
export const WINDOW_MAX = 10;
/** 买点分支阈值：距涨停 ≤ 该日仅 30 分 13/25 金叉；> 该日追加 60 分 13/25 金叉（BOLL 两分支同参 (45,2)） */
export const NEAR_DAYS = 6;
/** BOLL 参数：两分支统一 (45,2)（2026-10-17 20:40 用户修正，≤6 日分支原为 (20,2)） */
export const BOLL_N = 45;
export const BOLL_P = 2;
/** BOLL 缩口判定：带宽最近该根数持续下降 */
export const NARROW_BARS = 3;
/** MA13/25 金叉判定：最近该根数内发生上穿 */
export const CROSS_WITHIN = 5;

export interface ConditionToggles {
  limitUpWindow: boolean; // 涨停后 3–10 日内
  shrink: boolean; // 缩量至 55% 及以下
  notBreakLimitLow: boolean; // 不破首板最低价（连板取第一个涨停日）
  notBreakMa20: boolean; // 不破 20 日线
  closeAboveMa10: boolean; // 收盘价 > 10 日线
  bollNarrow: boolean; // 30 分 BOLL 缩口 + 30 分 13/25 买点（两分支均生效）
  maCross60: boolean; // 60 分 13/25 买点（>6 日分支）
}

export const DEFAULT_TOGGLES: ConditionToggles = {
  limitUpWindow: true,
  shrink: true,
  notBreakLimitLow: true,
  notBreakMa20: true,
  closeAboveMa10: true,
  bollNarrow: true,
  maCross60: true
};

export interface MainOptions {
  code?: string; // 可带交易所前缀，内部去前缀
  name?: string;
  toggles?: ConditionToggles;
  windowMin?: number;
  windowMax?: number;
  shrinkRatio?: number;
}

export interface MainResult {
  pass: boolean;
  limitUpIndex: number; // 涨停日下标；-1 = 未找到（含窗口外）
  daysSinceLimitUp: number; // 距涨停交易日数；未找到为 -1
  shrinkActual: number | null; // 实际最低缩量比（相对基准量）；未缩量为 null
  failReasons: string[];
}

/** 去交易所前缀：sh601929 → 601929 */
function bare(code: string): string {
  return (code ?? '').replace(/^[a-zA-Z]{2}/, '');
}

/** 涨跌停幅度（%）：ST 5%；双创（300/301/688/689）20%；北交所（8/4/920）30%；主板 10% */
export function limitPctFor(code: string, name: string): number {
  const n = (name ?? '').toUpperCase();
  if (n.includes('ST')) return 5;
  const c = bare(code);
  if (/^(30|301|688|689)/.test(c)) return 20;
  if (/^(8|4|920)/.test(c)) return 30;
  return 10;
}

/** 第 i 根是否为涨停（相对前收，含容差） */
export function isLimitUp(candles: Candle[], i: number, code = '', name = ''): boolean {
  if (i <= 0 || i >= candles.length) return false;
  const prev = candles[i - 1].close;
  const cur = candles[i].close;
  if (!(prev > 0) || !(cur > 0)) return false;
  const pct = (cur / prev - 1) * 100;
  return pct >= limitPctFor(code, name) - LIMIT_UP_TOLERANCE;
}

/**
 * 找涨停日 T：窗口内最近的一个（从最新侧往回找）。
 * windowMin=0 时允许含最新一根；windowMax=0 表示不限窗口（全数据扫描）。
 */
export function findLimitUpIndex(
  candles: Candle[],
  code = '',
  name = '',
  windowMin = WINDOW_MIN,
  windowMax = WINDOW_MAX
): number {
  const last = candles.length - 1;
  if (last < 1) return -1;
  const to = Math.max(0, last - Math.max(0, windowMin));
  const from = windowMax > 0 ? Math.max(0, last - windowMax) : 0;
  for (let i = to; i >= from; i--) {
    if (isLimitUp(candles, i, code, name)) return i;
  }
  return -1;
}

/**
 * 涨停连续段的首板日：从 t 往前回溯，前一日也是涨停则继续（二板/三板…取第一个涨停日）。
 * 单板时返回 t 本身。供「不破首板最低价」定基准低点（用户 2026-10-17 21:36 修改，
 * 原「不破涨停最低点」直接取锚点日 T 的最低价）。
 */
export function firstLimitUpInRun(candles: Candle[], t: number, code = '', name = ''): number {
  let first = t;
  while (first > 0 && isLimitUp(candles, first - 1, code, name)) first--;
  return first;
}

/** 主条件评估（日K）。窗口内无涨停 → 直接不过。 */
export function evalMainConditions(dayCandles: Candle[], opts: MainOptions = {}): MainResult {
  const toggles = { ...DEFAULT_TOGGLES, ...(opts.toggles ?? {}) };
  const windowMin = opts.windowMin ?? WINDOW_MIN;
  const windowMax = opts.windowMax ?? WINDOW_MAX;
  const shrinkRatio = opts.shrinkRatio ?? SHRINK_RATIO;
  const c = dayCandles;
  const failReasons: string[] = [];

  // 涨停日锚点：窗口开关关闭时仍要找（买点分支要用距涨停日数），此时不限窗口
  const t = findLimitUpIndex(
    c,
    opts.code ?? '',
    opts.name ?? '',
    toggles.limitUpWindow ? windowMin : 0,
    toggles.limitUpWindow ? windowMax : 0
  );
  if (t < 0) {
    return { pass: false, limitUpIndex: -1, daysSinceLimitUp: -1, shrinkActual: null, failReasons: ['窗口内无涨停'] };
  }
  const daysSince = c.length - 1 - t;

  if (toggles.limitUpWindow && (daysSince < windowMin || daysSince > windowMax)) {
    failReasons.push(`距涨停 ${daysSince} 日，不在 ${windowMin}–${windowMax} 日内`);
  }

  // 缩量：基准 = max(涨停日量, 次日量)；区间 = T+1 ~ 最新
  let shrinkActual: number | null = null;
  if (toggles.shrink) {
    const refVol = Math.max(c[t].volume, t + 1 < c.length ? c[t + 1].volume : c[t].volume);
    let minVol = Infinity;
    for (let i = t + 1; i < c.length; i++) minVol = Math.min(minVol, c[i].volume);
    if (minVol === Infinity) {
      failReasons.push('涨停后无后续K线');
    } else {
      shrinkActual = minVol / refVol;
      if (shrinkActual > shrinkRatio) {
        failReasons.push(`未缩量至 ${Math.round(shrinkRatio * 100)}%（最低 ${Math.round(shrinkActual * 100)}%）`);
      }
    }
  }

  // 不破首板最低价：T+1 ~ 最新 最低价 ≥ 涨停连续段首板日最低价（连板取第一个涨停日）
  if (toggles.notBreakLimitLow) {
    const firstT = firstLimitUpInRun(c, t, opts.code ?? '', opts.name ?? '');
    const limitLow = c[firstT].low;
    for (let i = t + 1; i < c.length; i++) {
      if (c[i].low < limitLow) {
        failReasons.push('跌破首板最低价');
        break;
      }
    }
  }

  // 不破 20 日线：T+1 ~ 最新 每日收盘 > 当日 MA20
  if (toggles.notBreakMa20) {
    const ma20 = movingAverage(
      c.map((x) => x.close),
      20
    );
    for (let i = t + 1; i < c.length; i++) {
      const m = ma20[i];
      if (m === null) {
        failReasons.push('MA20 数据不足');
        break;
      }
      if (!(c[i].close > m)) {
        failReasons.push('跌破 MA20');
        break;
      }
    }
  }

  return { pass: failReasons.length === 0, limitUpIndex: t, daysSinceLimitUp: daysSince, shrinkActual, failReasons };
}

export interface BuyPointInput {
  dayCandles: Candle[];
  m30: Candle[];
  m60: Candle[];
  daysSinceLimitUp: number;
  toggles?: ConditionToggles;
  nearDays?: number;
}

export interface BuyPointResult {
  pass: boolean;
  branch: 'near' | 'far';
  checks: { closeAboveMa10: boolean; bollNarrow: boolean; maCross: boolean };
  failReasons: string[];
}

/** 最新收盘 > MA10（日K） */
export function closeAboveMa10(dayCandles: Candle[]): boolean {
  if (dayCandles.length < 10) return false;
  const ma10 = movingAverage(
    dayCandles.map((c) => c.close),
    10
  );
  const m = ma10[ma10.length - 1];
  return m !== null && dayCandles[dayCandles.length - 1].close > m;
}

/** BOLL 带（中轨/上下轨），数据不足处置 null */
export function bollBands(closes: number[], n: number, p: number): ({ mid: number; upper: number; lower: number } | null)[] {
  return closes.map((_, i) => {
    if (i + 1 < n) return null;
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) sum += closes[j];
    const mid = sum / n;
    let sq = 0;
    for (let j = i - n + 1; j <= i; j++) sq += (closes[j] - mid) ** 2;
    const sd = Math.sqrt(sq / n);
    return { mid, upper: mid + p * sd, lower: mid - p * sd };
  });
}

/** BOLL 缩口：带宽 (上-下)/中 最近 NARROW_BARS 根持续下降 */
export function bollNarrowing(candles: Candle[], n: number, p: number): boolean {
  const bands = bollBands(
    candles.map((c) => c.close),
    n,
    p
  );
  const bw = bands.map((b) => (b && b.mid > 0 ? (b.upper - b.lower) / b.mid : null));
  const L = bw.length;
  if (L < NARROW_BARS) return false;
  for (let i = L - NARROW_BARS + 1; i < L; i++) {
    const prev = bw[i - 1];
    const cur = bw[i];
    if (prev === null || cur === null || !(cur < prev)) return false;
  }
  return true;
}

/** 快均线上穿慢均线：最近 within 根内发生（含最新一根） */
export function crossUp(candles: Candle[], fast: number, slow: number, within = CROSS_WITHIN): boolean {
  const f = movingAverage(
    candles.map((c) => c.close),
    fast
  );
  const s = movingAverage(
    candles.map((c) => c.close),
    slow
  );
  for (let i = Math.max(1, candles.length - within); i < candles.length; i++) {
    const f0 = f[i];
    const f1 = f[i - 1];
    const s0 = s[i];
    const s1 = s[i - 1];
    if (f0 !== null && f1 !== null && s0 !== null && s1 !== null && f0 > s0 && f1 <= s1) return true;
  }
  return false;
}

/** 买点评估：按距涨停日数自动切换分支（口径：用户 2026-10-17 21:09 澄清——≤6 日仅 30 分 13/25；>6 日 30 分 + 60 分 13/25） */
export function evalBuyPoint(input: BuyPointInput): BuyPointResult {
  const toggles = { ...DEFAULT_TOGGLES, ...(input.toggles ?? {}) };
  const nearDays = input.nearDays ?? NEAR_DAYS;
  const branch: 'near' | 'far' = input.daysSinceLimitUp <= nearDays ? 'near' : 'far';
  const failReasons: string[] = [];

  const cAbove = closeAboveMa10(input.dayCandles);
  if (toggles.closeAboveMa10 && !cAbove) failReasons.push('收盘未站上 MA10');

  // BOLL 缩口：两分支同参 (45,2)，均看 30 分钟
  const bollOk = bollNarrowing(input.m30, BOLL_N, BOLL_P);
  if (toggles.bollNarrow && !bollOk) {
    failReasons.push('30 分 BOLL(45,2) 未缩口');
  }

  // 30 分 13/25 金叉：两分支都要（≤6 日分支的唯一买点）
  const cross30Ok = crossUp(input.m30, 13, 25);
  if (toggles.bollNarrow && !cross30Ok) {
    failReasons.push('30 分 MA13/25 未金叉');
  }

  // 60 分 13/25 金叉：仅 >6 日分支额外要求
  let cross60Ok = true;
  if (branch === 'far') {
    cross60Ok = crossUp(input.m60, 13, 25);
    if (toggles.maCross60 && !cross60Ok) {
      failReasons.push('60 分 MA13/25 未金叉');
    }
  }

  return {
    pass: failReasons.length === 0,
    branch,
    checks: { closeAboveMa10: cAbove, bollNarrow: bollOk, maCross: cross30Ok && cross60Ok },
    failReasons
  };
}
