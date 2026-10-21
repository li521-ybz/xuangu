// 模块③ 持仓：交易流水 → 持仓聚合（纯函数，可单测）
//
// 成本口径（与券商账单一致，2026-10-21 定稿）：
//   - 买入：新成本额 = 旧成本额 + 成交额 + 买入费用，成本价 = 成本额 / 新数量（费用摊薄进成本）；
//   - 卖出：成本额按卖出比例转出（成本价不变），实现盈亏 = 卖出成交额 − 卖出费用 − 转出成本额；
//   - 全清后该股移除，已实现盈亏累计到总账。
// 卖出数量超过持仓时按持仓量截断（避免脏数据把数量算成负数）。

import type { Trade } from '../../lib/types';
import { bareSymbol } from '../../lib/symbol';

export interface Holding {
  symbol: string;
  name: string;
  qty: number;
  cost: number; // 每股成本（含买入费摊薄）
  costAmount: number; // 持仓总成本
  realized: number; // 该股已实现盈亏
}

export interface HoldingWithQuote extends Holding {
  price: number;
  prevClose: number;
  changePct: number;
  marketValue: number;
  floatPnl: number; // 浮动盈亏 = 市值 − 成本额
  floatPct: number; // 浮动盈亏率（%）
  dayPnl: number; // 当日盈亏 = 数量 × (现价 − 昨收)
  weight: number; // 仓位占比（%）
}

/** 按月/日排序的交易（先按日期，再按录入顺序，保证同日多笔可重现） */
export function sortTrades(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : (a.seq ?? 0) - (b.seq ?? 0);
  });
}

/** 交易流水 → 当前持仓（含已清仓股票的已实现盈亏汇总） */
export function buildHoldings(trades: Trade[]): {
  holdings: Holding[];
  realizedTotal: number;
} {
  const map = new Map<string, Holding>();
  let realizedTotal = 0;

  for (const t of sortTrades(trades)) {
    if (!(t.qty > 0) || !(t.price >= 0)) continue;
    const key = t.symbol;
    const cur = map.get(key) ?? { symbol: key, name: t.name, qty: 0, cost: 0, costAmount: 0, realized: 0 };

    if (t.side === 'buy') {
      cur.qty += t.qty;
      cur.costAmount += t.price * t.qty + t.fee;
      cur.cost = cur.qty > 0 ? cur.costAmount / cur.qty : 0;
      cur.name = t.name || cur.name;
    } else {
      const sellQty = Math.min(t.qty, cur.qty);
      if (sellQty > 0) {
        const outCost = cur.cost * sellQty; // 转出成本额（按成本价）
        const proceeds = t.price * sellQty - t.fee;
        const pnl = proceeds - outCost;
        cur.realized += pnl;
        realizedTotal += pnl;
        cur.qty -= sellQty;
        cur.costAmount = Math.max(0, cur.costAmount - outCost);
        cur.cost = cur.qty > 0 ? cur.costAmount / cur.qty : 0;
      }
    }

    if (cur.qty <= 0) {
      // 已清仓：保留已实现盈亏记录，但不再显示为持仓
      map.set(key, { ...cur, qty: 0, cost: 0, costAmount: 0 });
    } else {
      map.set(key, cur);
    }
  }

  const holdings = [...map.values()].filter((h) => h.qty > 0);
  return { holdings, realizedTotal };
}

export interface QuoteLike {
  price: number;
  prevClose: number;
  changePct: number;
}

/** 持仓 + 实时行情 → 展示行（算出市值/浮动盈亏/当日盈亏/仓位占比） */
export function withQuotes(
  holdings: Holding[],
  quotes: Record<string, QuoteLike>
): HoldingWithQuote[] {
  const rows: HoldingWithQuote[] = holdings.map((h) => {
    const q = quotes[bareSymbol(h.symbol)] ?? quotes[h.symbol];
    const price = q?.price ?? h.cost; // 无行情时用成本价，避免市值显示 0
    const prevClose = q?.prevClose ?? price;
    const marketValue = price * h.qty;
    const floatPnl = marketValue - h.costAmount;
    return {
      ...h,
      price,
      prevClose,
      changePct: q?.changePct ?? 0,
      marketValue,
      floatPnl,
      floatPct: h.costAmount > 0 ? (floatPnl / h.costAmount) * 100 : 0,
      dayPnl: (price - prevClose) * h.qty,
      weight: 0
    };
  });

  const totalValue = rows.reduce((s, r) => s + r.marketValue, 0);
  for (const r of rows) r.weight = totalValue > 0 ? (r.marketValue / totalValue) * 100 : 0;
  return rows.sort((a, b) => b.marketValue - a.marketValue);
}

export interface PortfolioSummary {
  marketValue: number;
  costAmount: number;
  floatPnl: number;
  floatPct: number;
  dayPnl: number;
  realizedTotal: number;
  totalPnl: number;
  count: number;
}

export function summarizePortfolio(rows: HoldingWithQuote[], realizedTotal: number): PortfolioSummary {
  const marketValue = rows.reduce((s, r) => s + r.marketValue, 0);
  const costAmount = rows.reduce((s, r) => s + r.costAmount, 0);
  const dayPnl = rows.reduce((s, r) => s + r.dayPnl, 0);
  const floatPnl = marketValue - costAmount;
  return {
    marketValue,
    costAmount,
    floatPnl,
    floatPct: costAmount > 0 ? (floatPnl / costAmount) * 100 : 0,
    dayPnl,
    realizedTotal,
    totalPnl: floatPnl + realizedTotal,
    count: rows.length
  };
}
