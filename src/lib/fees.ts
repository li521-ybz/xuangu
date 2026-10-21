// A 股交易费用：持仓录入、模拟盘撮合、策略回测三处共用（口径与本地 Python 版工作台一致）
//
// 2026-10-21 口径（用户确认沿用）：
//   佣金   成交额 × 0.025%，最低 5 元（双向）
//   印花税 成交额 × 0.05%，仅卖出
//   过户费 成交额 × 0.001%，双向
// 说明：佣金最低 5 元对小额单影响明显（1000 元买入也收 5 元 ≈ 0.5%），模拟盘必须照实算，
// 否则回测/模拟收益会系统性偏乐观。

export type Side = 'buy' | 'sell';

export const FEE_RATES = {
  commission: 0.00025,
  commissionMin: 5,
  stampTax: 0.0005,
  transferFee: 0.00001
} as const;

export interface FeeBreakdown {
  commission: number;
  stampTax: number;
  transferFee: number;
  total: number;
}

/** 计算一笔成交的费用（金额单位：元） */
export function calcFee(side: Side, price: number, qty: number): FeeBreakdown {
  const amount = Math.max(0, price) * Math.max(0, qty);
  if (amount <= 0) return { commission: 0, stampTax: 0, transferFee: 0, total: 0 };
  const commission = Math.max(amount * FEE_RATES.commission, FEE_RATES.commissionMin);
  const stampTax = side === 'sell' ? amount * FEE_RATES.stampTax : 0;
  const transferFee = amount * FEE_RATES.transferFee;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    commission: round(commission),
    stampTax: round(stampTax),
    transferFee: round(transferFee),
    total: round(commission + stampTax + transferFee)
  };
}

/** 买入整手校验：买入必须是 100 股整数倍；卖出允许零股但须一次清仓（由调用方判断） */
export function isLotAligned(qty: number): boolean {
  return Number.isInteger(qty) && qty > 0 && qty % 100 === 0;
}

/** 买入费用摊薄进成本后的每股成本 */
export function dilutedCost(price: number, qty: number, fee: number): number {
  if (qty <= 0) return 0;
  return (price * qty + fee) / qty;
}
