// 模块⑥ 策略回测引擎（纯函数，无副作用，可单测）
//
// 关键约束（用户 2026-10-21 口径，防未来函数）：
//   - 信号只用「当日收盘及之前」的数据计算；
//   - 成交一律在「次日开盘价」，T 日信号 T+1 开盘执行，绝不用当日收盘价成交；
//   - 费用按 lib/fees.ts（佣金 0.025% 最低 5 / 印花税 0.05% 卖出 / 过户费 0.001%）；
//   - 全仓进出，买入按整手（100 股）向下取整，预留 1% 现金防手续费不足；
//   - 期末强制按最后收盘价平仓，保证收益可对账。
import type { Candle, EquitySnapshot } from '../../lib/types';
import { calcFee } from '../../lib/fees';
import { summarize, type PerformanceSummary } from '../../lib/analytics';

export interface StrategyParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface StrategyDef {
  key: string;
  name: string;
  desc: string;
  params: StrategyParam[];
  /** 买入信号：只用 0..i 的数据 */
  signal: (candles: Candle[], i: number, p: Record<string, number>) => boolean;
}

/** 简单移动平均序列（不足窗口处为 NaN） */
export function sma(values: number[], window: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

/** EMA 序列 */
export function ema(values: number[], window: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  const k = 2 / (window + 1);
  let prev = NaN;
  for (let i = 0; i < values.length; i += 1) {
    prev = Number.isNaN(prev) ? values[i] : values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** MACD：返回 DIF / DEA */
export function macd(closes: number[], fast = 12, slow = 26, signal = 9): { dif: number[]; dea: number[] } {
  const fastE = ema(closes, fast);
  const slowE = ema(closes, slow);
  const dif = closes.map((_, i) => fastE[i] - slowE[i]);
  const dea = ema(dif, signal);
  return { dif, dea };
}

export const STRATEGIES: StrategyDef[] = [
  {
    key: 'maCross',
    name: '均线金叉',
    desc: '短期均线上穿长期均线买入，跌破长期均线卖出',
    params: [
      { key: 'short', label: '短期均线', min: 3, max: 20, step: 1, default: 5 },
      { key: 'long', label: '长期均线', min: 10, max: 120, step: 1, default: 20 }
    ],
    signal: (c, i, p) => {
      const closes = c.map((x) => x.close);
      const s = sma(closes, p.short);
      const l = sma(closes, p.long);
      if (i < 1 || Number.isNaN(s[i]) || Number.isNaN(l[i]) || Number.isNaN(s[i - 1]) || Number.isNaN(l[i - 1])) {
        return false;
      }
      return s[i - 1] <= l[i - 1] && s[i] > l[i];
    }
  },
  {
    key: 'breakout',
    name: '突破新高',
    desc: '收盘价突破前 N 日最高价买入（趋势启动）',
    params: [{ key: 'lookback', label: '回看天数', min: 5, max: 120, step: 1, default: 20 }],
    signal: (c, i, p) => {
      const n = Math.floor(p.lookback);
      if (i < n) return false;
      let hi = -Infinity;
      for (let k = i - n; k < i; k += 1) hi = Math.max(hi, c[k].high);
      return c[i].close > hi;
    }
  },
  {
    key: 'oversold',
    name: '超跌反弹',
    desc: '近 N 日跌幅超过阈值且收盘站上短期均线时买入',
    params: [
      { key: 'days', label: '统计天数', min: 3, max: 30, step: 1, default: 5 },
      { key: 'dropPct', label: '跌幅阈值(%)', min: 3, max: 30, step: 1, default: 8 },
      { key: 'ma', label: '均线周期', min: 3, max: 30, step: 1, default: 5 }
    ],
    signal: (c, i, p) => {
      const n = Math.floor(p.days);
      if (i < Math.max(n, p.ma)) return false;
      const drop = ((c[i].close - c[i - n].close) / c[i - n].close) * 100;
      const closes = c.map((x) => x.close);
      const m = sma(closes, p.ma);
      return drop <= -p.dropPct && c[i].close > m[i];
    }
  },
  {
    key: 'volBreak',
    name: '放量突破',
    desc: '成交量放大至均量 N 倍且当日涨幅达标时买入',
    params: [
      { key: 'volRatio', label: '量能倍数', min: 1.2, max: 5, step: 0.1, default: 2 },
      { key: 'risePct', label: '涨幅阈值(%)', min: 1, max: 10, step: 0.5, default: 3 },
      { key: 'volWindow', label: '均量周期', min: 3, max: 30, step: 1, default: 5 }
    ],
    signal: (c, i, p) => {
      const w = Math.floor(p.volWindow);
      if (i < w + 1) return false;
      let volSum = 0;
      for (let k = i - w; k < i; k += 1) volSum += c[k].volume;
      const avgVol = volSum / w;
      const rise = ((c[i].close - c[i - 1].close) / c[i - 1].close) * 100;
      return c[i].volume >= avgVol * p.volRatio && rise >= p.risePct;
    }
  },
  {
    key: 'macdCross',
    name: 'MACD 金叉',
    desc: 'DIF 上穿 DEA 买入（趋势确认）',
    params: [
      { key: 'fast', label: '快线', min: 5, max: 20, step: 1, default: 12 },
      { key: 'slow', label: '慢线', min: 15, max: 60, step: 1, default: 26 },
      { key: 'signal', label: '信号线', min: 3, max: 20, step: 1, default: 9 }
    ],
    signal: (c, i, p) => {
      const closes = c.map((x) => x.close);
      if (i < p.slow + p.signal) return false;
      const { dif, dea } = macd(closes, p.fast, p.slow, p.signal);
      return dif[i - 1] <= dea[i - 1] && dif[i] > dea[i];
    }
  }
];

export function strategyByKey(key: string): StrategyDef {
  return STRATEGIES.find((s) => s.key === key) ?? STRATEGIES[0];
}

export interface BacktestOptions {
  strategyKey: string;
  params: Record<string, number>;
  maxHoldDays: number; // 最长持有天数（0 = 不限制）
  stopLossPct: number; // 止损（%，0 = 不设）
  takeProfitPct: number; // 止盈（%，0 = 不设）
  initialCash?: number;
}

export interface BacktestTrade {
  inDate: string;
  inPrice: number;
  outDate: string;
  outPrice: number;
  qty: number;
  fee: number;
  pnl: number;
  pnlPct: number;
  days: number;
  reason: string;
}

export interface BacktestResult {
  equity: EquitySnapshot[];
  benchmark: EquitySnapshot[];
  trades: BacktestTrade[];
  summary: PerformanceSummary;
  benchmarkReturn: number;
  finalCash: number;
}

/** 空结果（K线不足或未产生交易时用） */
function emptyResult(initialCash: number): BacktestResult {
  return {
    equity: [],
    benchmark: [],
    trades: [],
    summary: summarize([], []),
    benchmarkReturn: 0,
    finalCash: initialCash
  };
}

/** 执行回测 */
export function runBacktest(candles: Candle[], opts: BacktestOptions): BacktestResult {
  const initialCash = opts.initialCash ?? 100_000;
  if (candles.length < 30) return emptyResult(initialCash);

  const strat = strategyByKey(opts.strategyKey);
  const params = { ...defaultParams(strat), ...opts.params };
  const maxHold = Math.max(0, Math.floor(opts.maxHoldDays));

  let cash = initialCash;
  let qty = 0;
  let entryIdx = -1;
  let entryPrice = 0;
  let entryFee = 0;
  let pending: 'buy' | 'sell' | null = null;
  let pendingReason = '';

  const trades: BacktestTrade[] = [];
  const equity: EquitySnapshot[] = [];
  const benchmark: EquitySnapshot[] = [];

  // 预热：均线/MACD 需要历史，前 30 根只观察不交易（保证第一条信号有足够数据）
  const start = Math.min(30, candles.length - 1);
  const benchBase = candles[start].open;

  for (let i = start; i < candles.length; i += 1) {
    const c = candles[i];
    const date = c.date.slice(0, 10).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

    // ① 先执行上一根产生的信号（今日开盘成交）
    if (pending === 'buy' && qty === 0) {
      const budget = cash * 0.99;
      const lots = Math.floor(budget / c.open / 100) * 100;
      if (lots >= 100) {
        const amount = c.open * lots;
        const buyFee = calcFee('buy', c.open, lots).total;
        if (amount + buyFee <= cash) {
          cash -= amount + buyFee;
          qty = lots;
          entryIdx = i;
          entryPrice = c.open;
          entryFee = buyFee;
        }
      }
    } else if (pending === 'sell' && qty > 0) {
      const amount = c.open * qty;
      const sellFee = calcFee('sell', c.open, qty).total;
      cash += amount - sellFee;
      const costBasis = entryPrice * qty + entryFee;
      const pnl = amount - sellFee - costBasis;
      trades.push({
        inDate: candles[entryIdx].date.slice(0, 10).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
        inPrice: entryPrice,
        outDate: date,
        outPrice: c.open,
        qty,
        fee: entryFee + sellFee,
        pnl,
        pnlPct: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
        days: i - entryIdx,
        reason: pendingReason
      });
      qty = 0;
      entryIdx = -1;
      entryPrice = 0;
      entryFee = 0;
    }
    pending = null;

    // ② 今日收盘判断信号（明日开盘执行）
    if (qty > 0) {
      const holdDays = i - entryIdx;
      const pnlPct = entryPrice > 0 ? ((c.close - entryPrice) / entryPrice) * 100 : 0;
      const closes = candles.map((x) => x.close);
      const exitMa = sma(closes, params.long ?? 20);
      const reasons: string[] = [];
      if (maxHold > 0 && holdDays >= maxHold) reasons.push(`持有满 ${maxHold} 日`);
      if (opts.stopLossPct > 0 && pnlPct <= -opts.stopLossPct) reasons.push(`止损 ${opts.stopLossPct}%`);
      if (opts.takeProfitPct > 0 && pnlPct >= opts.takeProfitPct) reasons.push(`止盈 ${opts.takeProfitPct}%`);
      if (!Number.isNaN(exitMa[i]) && c.close < exitMa[i]) reasons.push('跌破均线');
      if (reasons.length > 0 && i < candles.length - 1) {
        pending = 'sell';
        pendingReason = reasons[0];
      }
    } else if (strat.signal(candles, i, params) && i < candles.length - 1) {
      pending = 'buy';
    }

    // ③ 收盘估值
    const value = Math.round((cash + qty * c.close) * 100) / 100;
    equity.push({ date, value });
    const bench = Math.round((initialCash * (c.close / benchBase)) * 100) / 100;
    benchmark.push({ date, value: bench });
  }

  // 期末强制平仓（按最后收盘价，计入交易明细）
  const lastCandle = candles[candles.length - 1];
  if (qty > 0) {
    const amount = lastCandle.close * qty;
    const sellFee = calcFee('sell', lastCandle.close, qty).total;
    cash += amount - sellFee;
    const costBasis = entryPrice * qty + entryFee;
    const pnl = amount - sellFee - costBasis;
    trades.push({
      inDate: candles[entryIdx].date.slice(0, 10).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
      inPrice: entryPrice,
      outDate: lastCandle.date.slice(0, 10).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
      outPrice: lastCandle.close,
      qty,
      fee: entryFee + sellFee,
      pnl,
      pnlPct: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
      days: candles.length - 1 - entryIdx,
      reason: '期末平仓'
    });
    qty = 0;
    // 修正最后一点净值
    if (equity.length > 0) {
      equity[equity.length - 1] = { ...equity[equity.length - 1], value: Math.round(cash * 100) / 100 };
    }
  }

  const summary = summarize(equity, trades.map((t) => ({ pnl: t.pnl })));
  const lastBench = benchmark[benchmark.length - 1]?.value ?? initialCash;

  return {
    equity,
    benchmark,
    trades,
    summary,
    benchmarkReturn: ((lastBench - initialCash) / initialCash) * 100,
    finalCash: Math.round(cash * 100) / 100
  };
}

/** 策略默认参数 */
export function defaultParams(strat: StrategyDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of strat.params) out[p.key] = p.default;
  return out;
}
