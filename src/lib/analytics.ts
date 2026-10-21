// 绩效与净值计算：持仓 / 模拟盘 / 回测三个模块共用（纯函数，无副作用，可单测）
//
// 口径统一（与本地 Python 版 workbench 对齐，2026-10-21）：
// - 回撤一律返回**正数百分比**（12.5 表示最大回撤 12.5%），0 表示无回撤；
// - 年化按 244 个交易日折算，区间不足 1 年不做夸大（用实际天数折算）；
// - 胜率 / 盈亏比只统计已平仓交易（有实现盈亏的卖出）。

export interface EquityPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

/** 最大回撤（%）：从任意历史高点到其后最低点的最大跌幅 */
export function maxDrawdown(points: Array<{ value: number }>): number {
  let peak = -Infinity;
  let worst = 0;
  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    if (p.value > peak) peak = p.value;
    if (peak > 0) {
      const dd = ((peak - p.value) / peak) * 100;
      if (dd > worst) worst = dd;
    }
  }
  return worst;
}

/** 区间总收益率（%）：(末值 - 首值) / 首值 */
export function totalReturn(points: Array<{ value: number }>): number {
  if (points.length < 2) return 0;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (!Number.isFinite(first) || first <= 0) return 0;
  return ((last - first) / first) * 100;
}

/** 单笔简单收益率序列（用于波动率 / 夏普）：相邻点环比 */
export function periodReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1];
    const cur = values[i];
    if (Number.isFinite(prev) && prev > 0 && Number.isFinite(cur)) {
      out.push(cur / prev - 1);
    }
  }
  return out;
}

/** 年化收益率（%）：按交易日数量折算，不足 244 天不放大到年 */
export function annualizedReturn(points: Array<{ value: number }>): number {
  if (points.length < 2) return 0;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (!Number.isFinite(first) || first <= 0) return 0;
  const days = Math.max(1, points.length - 1);
  const years = days / 244;
  if (years <= 0) return 0;
  const ratio = last / first;
  if (ratio <= 0) return -100;
  return (Math.pow(ratio, 1 / years) - 1) * 100;
}

/** 年化波动率（%）：日收益标准差 × √244 */
export function annualizedVolatility(values: number[]): number {
  const rs = periodReturns(values);
  if (rs.length < 2) return 0;
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  const variance = rs.reduce((a, b) => a + (b - mean) ** 2, 0) / (rs.length - 1);
  return Math.sqrt(variance) * Math.sqrt(244) * 100;
}

/** 夏普比率：无风险利率默认 0（简化），区间内收益均值 / 标准差 × √244 */
export function sharpeRatio(values: number[], riskFree = 0): number {
  const rs = periodReturns(values);
  if (rs.length < 2) return 0;
  const dailyRf = riskFree / 244;
  const excess = rs.map((r) => r - dailyRf);
  const mean = excess.reduce((a, b) => a + b, 0) / excess.length;
  const variance = excess.reduce((a, b) => a + (b - mean) ** 2, 0) / (excess.length - 1);
  const sd = Math.sqrt(variance);
  if (sd === 0) return 0;
  return (mean / sd) * Math.sqrt(244);
}

export interface ClosedTrade {
  pnl: number; // 实现盈亏（已扣手续费）
}

/** 胜率（%）：盈利笔数 / 总笔数 */
export function winRate(trades: ClosedTrade[]): number {
  if (trades.length === 0) return 0;
  const wins = trades.filter((t) => t.pnl > 0).length;
  return (wins / trades.length) * 100;
}

/** 盈亏比：总盈利 / 总亏损（无亏损时返回 0 表示不可比） */
export function profitFactor(trades: ClosedTrade[]): number {
  let gain = 0;
  let loss = 0;
  for (const t of trades) {
    if (t.pnl > 0) gain += t.pnl;
    else loss += -t.pnl;
  }
  if (loss <= 0) return 0;
  return gain / loss;
}

/** 一组已平仓交易的绩效摘要（模拟盘 / 回测结果卡片共用） */
export interface PerformanceSummary {
  totalReturn: number;
  annualized: number;
  maxDrawdown: number;
  volatility: number;
  sharpe: number;
  winRate: number;
  profitFactor: number;
  trades: number;
}

export function summarize(points: EquityPoint[], closed: ClosedTrade[]): PerformanceSummary {
  const values = points.map((p) => p.value);
  return {
    totalReturn: totalReturn(points),
    annualized: annualizedReturn(points),
    maxDrawdown: maxDrawdown(points),
    volatility: annualizedVolatility(values),
    sharpe: sharpeRatio(values),
    winRate: winRate(closed),
    profitFactor: profitFactor(closed),
    trades: closed.length
  };
}

/** 金额口径：过万显示「x.xx 万」，过亿显示「x.xx 亿」（市场成交额/资金流用） */
export function moneyText(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)} 亿`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)} 万`;
  return value.toFixed(2);
}

/** 数量文本：整手显示「x 手(x 股)」在表格里太挤，这里只用股数，带千分位 */
export function qtyText(qty: number): string {
  return qty.toLocaleString('zh-CN');
}
