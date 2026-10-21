// 模块⑤ 模拟盘：撮合与账务引擎（纯函数，无副作用，可单测）
//
// 规则（A 股实盘口径，2026-10-21 定稿；与本地 Python 版 workbench sim.py 对齐）：
//   最小买入单位 100 股整数倍；卖出可零股但必须一次清仓；
//   T+1：当日买入次日才可卖（按交易日字符串比较解冻）；
//   费用见 lib/fees.ts（佣金 0.025% 最低 5 / 印花税 0.05% 仅卖出 / 过户费 0.001% 双向）；
//   买入手续费摊薄进持仓成本，卖出实现盈亏 = 卖出净额 − 转出成本。
// 市价单以传入的现价成交；限价单：买价 ≥ 现价 或 卖价 ≤ 现价 立即成交，否则挂 pending 等撮合。
import type { Trade } from '../../lib/types';
import { calcFee, isLotAligned, type Side } from '../../lib/fees';
import { newId } from '../../lib/store';

export interface SimAccount {
  initialCash: number;
  cash: number;
  createdAt: string;
}

export interface SimPosition {
  symbol: string;
  name: string;
  qty: number;
  availableQty: number; // 可卖数量（T+1 冻结后次日解冻）
  costAmount: number; // 持仓成本额（含买入费用）
  lastBuyDate: string; // 最后买入日：< 今天则全部解冻
}

export type OrderStatus = 'filled' | 'pending' | 'cancelled';

export interface SimOrder {
  id: string;
  symbol: string;
  name: string;
  side: Side;
  type: 'market' | 'limit';
  price: number; // 限价单委托价；市价单为用户参考价（成交价以现价为准）
  qty: number;
  status: OrderStatus;
  createdAt: string; // ISO
  filledAt?: string;
  fillPrice?: number;
  fee?: number;
  realized?: number; // 卖出单实现盈亏
}

export interface SimState {
  account: SimAccount;
  positions: SimPosition[];
  orders: SimOrder[];
  equity: Array<{ date: string; value: number }>;
}

export const DEFAULT_INITIAL_CASH = 100_000;

export function createSimState(initialCash = DEFAULT_INITIAL_CASH, today = todayStr()): SimState {
  return {
    account: { initialCash, cash: initialCash, createdAt: new Date().toISOString() },
    positions: [],
    orders: [],
    equity: []
  };
}

export function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 持仓成本价 */
export function positionCost(p: SimPosition): number {
  return p.qty > 0 ? p.costAmount / p.qty : 0;
}

/** T+1 解冻：最后买入日早于今天 → 可卖数量恢复为全部持仓 */
export function settlePositions(state: SimState, today: string): SimState {
  const changed = state.positions.some((p) => p.lastBuyDate < today && p.availableQty !== p.qty);
  if (!changed) return state;
  return {
    ...state,
    positions: state.positions.map((p) =>
      p.lastBuyDate < today ? { ...p, availableQty: p.qty } : p
    )
  };
}

/** 持仓市值与总资产（用传入的现价表；缺价按成本价估） */
export function markToMarket(
  state: SimState,
  prices: Record<string, number>
): { marketValue: number; total: number } {
  const marketValue = state.positions.reduce((s, p) => {
    const price = prices[p.symbol.replace(/^[a-z]{2}/, '')] ?? prices[p.symbol] ?? positionCost(p);
    return s + price * p.qty;
  }, 0);
  return { marketValue, total: state.account.cash + marketValue };
}

export interface PlaceInput {
  symbol: string;
  name: string;
  side: Side;
  type: 'market' | 'limit';
  price: number; // 限价单委托价；市价单时传现价
  qty: number;
}

export interface PlaceResult {
  state: SimState;
  order: SimOrder;
  error?: string;
}

/** 校验并下单：能立即成交就成交，否则（限价单）进挂单池 */
export function placeOrder(state: SimState, input: PlaceInput, quotePrice: number, today = todayStr()): PlaceResult {
  const status: OrderStatus = 'pending';
  const base: SimOrder = {
    id: newId('order'),
    symbol: input.symbol,
    name: input.name,
    side: input.side,
    type: input.type,
    price: input.price,
    qty: input.qty,
    status,
    createdAt: new Date().toISOString()
  };

  if (!(input.qty > 0)) return { state, order: base, error: '数量必须大于 0' };
  if (!(input.price > 0) && input.type === 'limit') return { state, order: base, error: '限价必须大于 0' };
  if (!(quotePrice > 0) && input.type === 'market') return { state, order: base, error: '缺少现价，无法市价成交' };

  if (input.side === 'buy' && !isLotAligned(input.qty)) {
    return { state, order: base, error: '买入数量须为 100 股整数倍' };
  }

  // 成交价：市价单 = 现价；限价单 = 可立即成交时现价（更优），否则挂单
  const marketable =
    input.type === 'market' ||
    (input.side === 'buy' ? input.price >= quotePrice : input.price <= quotePrice);

  if (!marketable) {
    return { state: { ...state, orders: [base, ...state.orders] }, order: base };
  }

  const fillPrice = input.type === 'market' ? quotePrice : Math.min(input.price, quotePrice) || quotePrice;
  return fillOrder(state, base, fillPrice, quotePrice, today);
}

/** 把一张订单按指定价格成交（内部：买入冻结/卖出解冻并算实现盈亏） */
function fillOrder(
  state: SimState,
  order: SimOrder,
  fillPrice: number,
  quotePrice: number,
  today: string
): PlaceResult {
  const amount = fillPrice * order.qty;
  const fee = calcFee(order.side, fillPrice, order.qty).total;
  const existing = state.positions.find((p) => p.symbol === order.symbol);

  if (order.side === 'buy') {
    const need = amount + fee;
    if (need > state.account.cash + 1e-6) {
      return { state, order, error: `可用资金不足：需 ${need.toFixed(2)} 元，可用 ${state.account.cash.toFixed(2)} 元` };
    }
    const filled: SimOrder = {
      ...order,
      status: 'filled',
      filledAt: new Date().toISOString(),
      fillPrice,
      fee
    };
    const nextPositions = existing
      ? state.positions.map((p) =>
          p.symbol === order.symbol
            ? {
                ...p,
                name: order.name || p.name,
                qty: p.qty + order.qty,
                costAmount: p.costAmount + amount + fee,
                lastBuyDate: today // 当日买入部分不可卖，availableQty 保持原值
              }
            : p
        )
      : [
          ...state.positions,
          {
            symbol: order.symbol,
            name: order.name,
            qty: order.qty,
            availableQty: 0,
            costAmount: amount + fee,
            lastBuyDate: today
          }
        ];

    return {
      state: {
        ...state,
        account: { ...state.account, cash: round2(state.account.cash - need) },
        positions: nextPositions,
        orders: [filled, ...state.orders]
      },
      order: filled
    };
  }

  // 卖出：先检查可卖数量（T+1 / 零股整笔）
  if (!existing || existing.availableQty <= 0) {
    return { state, order, error: '可卖数量为 0（T+1：当日买入次日可卖）' };
  }
  if (order.qty > existing.availableQty) {
    return { state, order, error: `可卖数量不足：可卖 ${existing.availableQty} 股` };
  }
  // 零股卖出必须一次清仓
  if (order.qty < 100 && order.qty !== existing.qty) {
    return { state, order, error: '不足 100 股的部分必须一次性全部卖出' };
  }

  const costOut = positionCost(existing) * order.qty;
  const realized = amount - fee - costOut;
  const remainQty = existing.qty - order.qty;
  const filled: SimOrder = {
    ...order,
    status: 'filled',
    filledAt: new Date().toISOString(),
    fillPrice,
    fee,
    realized
  };

  const nextPositions = state.positions
    .map((p) =>
      p.symbol === order.symbol
        ? {
            ...p,
            qty: remainQty,
            availableQty: Math.max(0, p.availableQty - order.qty),
            costAmount: Math.max(0, p.costAmount - costOut)
          }
        : p
    )
    .filter((p) => p.qty > 0);

  return {
    state: {
      ...state,
      account: { ...state.account, cash: round2(state.account.cash + amount - fee) },
      positions: nextPositions,
      orders: [filled, ...state.orders]
    },
    order: filled
  };
}

/** 挂单撮合：每轮行情刷新后调用，价格到位自动成交（返回新状态与成交数） */
export function matchPending(
  state: SimState,
  quotes: Record<string, number>,
  today = todayStr()
): { state: SimState; filled: number } {
  const pending = state.orders.filter((o) => o.status === 'pending');
  if (pending.length === 0) return { state, filled: 0 };

  let cur = state;
  let filled = 0;
  // 从最早挂单开始撮合，保证顺序可预期
  for (const order of [...pending].reverse()) {
    const p = quotes[order.symbol.replace(/^[a-z]{2}/, '')] ?? quotes[order.symbol];
    if (!(p > 0)) continue;
    const hit = order.side === 'buy' ? p <= order.price : p >= order.price;
    if (!hit) continue;
    const res = fillOrder(
      cur,
      cur.orders.find((o) => o.id === order.id) ?? order,
      p,
      p,
      today
    );
    if (!res.error && res.order.status === 'filled') {
      cur = res.state;
      filled += 1;
    }
  }
  return { state: cur, filled };
}

/** 撤单 */
export function cancelOrder(state: SimState, id: string): SimState {
  return {
    ...state,
    orders: state.orders.map((o) => (o.id === id && o.status === 'pending' ? { ...o, status: 'cancelled' } : o))
  };
}

/** 账户绩效：已实现盈亏序列 + 权益曲线 */
export function simPerformance(state: SimState): {
  filled: SimOrder[];
  closed: Trade[];
  totalPnl: number;
  returnPct: number;
} {
  const filled = state.orders.filter((o) => o.status === 'filled');
  const closed = filled
    .filter((o) => o.side === 'sell' && typeof o.realized === 'number')
    .map((o) => ({
      id: o.id,
      symbol: o.symbol,
      name: o.name,
      side: 'sell' as const,
      price: o.fillPrice ?? 0,
      qty: o.qty,
      fee: o.fee ?? 0,
      date: (o.filledAt ?? o.createdAt).slice(0, 10)
    }));
  const totalPnl = filled.reduce((s, o) => s + (o.side === 'sell' ? (o.realized ?? 0) : 0), 0);
  const last = state.equity[state.equity.length - 1];
  const returnPct = state.account.initialCash > 0 && last
    ? ((last.value - state.account.initialCash) / state.account.initialCash) * 100
    : ((state.account.cash - state.account.initialCash) / state.account.initialCash) * 100;
  return { filled, closed, totalPnl, returnPct };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
