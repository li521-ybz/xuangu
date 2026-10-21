// 模拟盘撮合引擎测试：整手 / T+1 / 限价挂单 / 资金与可卖校验 / 费用与实现盈亏
import { describe, it, expect } from 'vitest';
import {
  cancelOrder,
  createSimState,
  matchPending,
  placeOrder,
  positionCost,
  settlePositions,
  type PlaceInput
} from './sim';

const TODAY = '2026-10-21';
const TOMORROW = '2026-10-22';

function input(p: Partial<PlaceInput> = {}): PlaceInput {
  return { symbol: 'sh600000', name: '浦发银行', side: 'buy', type: 'market', price: 10, qty: 1000, ...p };
}

/** 建仓辅助：以 10 元买入 1000 股（成交价 10 元） */
function withPosition() {
  const r = placeOrder(createSimState(), input(), 10, TODAY);
  expect(r.error).toBeUndefined();
  return r.state;
}

describe('createSimState', () => {
  it('初始资金默认 10 万，空仓空委托', () => {
    const s = createSimState();
    expect(s.account.initialCash).toBe(100_000);
    expect(s.account.cash).toBe(100_000);
    expect(s.positions).toHaveLength(0);
    expect(s.orders).toHaveLength(0);
  });
});

describe('买入校验', () => {
  it('非 100 股整数倍被拒', () => {
    const r = placeOrder(createSimState(), input({ qty: 150 }), 10, TODAY);
    expect(r.error).toContain('100 股整数倍');
    expect(r.state.orders).toHaveLength(0);
  });

  it('资金不足被拒（含费用）', () => {
    // 10 万本金买 10 万股 × 10 元 = 100 万
    const r = placeOrder(createSimState(100_000), input({ qty: 100_000 }), 10, TODAY);
    expect(r.error).toContain('可用资金不足');
  });

  it('市价买入成交：现金扣成交额+费用，持仓成本含费用，可卖为 0（T+1）', () => {
    const s = withPosition();
    // 10 × 1000 = 10000，费用 = 佣金 5（0.025%×10000=2.5→最低5）+ 过户费 0.1
    expect(s.account.cash).toBeCloseTo(100_000 - 10_000 - 5.1, 2);
    expect(s.positions[0].qty).toBe(1000);
    expect(s.positions[0].availableQty).toBe(0);
    expect(positionCost(s.positions[0])).toBeCloseTo(10.0051, 4);
    expect(s.orders[0].status).toBe('filled');
  });
});

describe('T+1 与卖出', () => {
  it('当日买入当日不可卖', () => {
    const s = withPosition();
    const r = placeOrder(s, input({ side: 'sell', qty: 500 }), 11, TODAY);
    expect(r.error).toContain('T+1');
  });

  it('次日解冻后可卖，实现盈亏 = 卖出净额 − 转出成本', () => {
    const settled = settlePositions(withPosition(), TOMORROW);
    expect(settled.positions[0].availableQty).toBe(1000);

    const r = placeOrder(settled, input({ side: 'sell', qty: 500 }), 11, TOMORROW);
    expect(r.error).toBeUndefined();
    const order = r.state.orders.find((o) => o.side === 'sell')!;
    // 卖出额 5500，费用：佣金 5（1.375→5）+ 印花税 2.75 + 过户费 0.055 ≈ 7.81
    // 转出成本 500 × 10.0051 = 5002.55
    expect(order.realized).toBeCloseTo(5500 - 7.8 - 5002.55, 1);
    expect(r.state.positions[0].qty).toBe(500);
    expect(r.state.positions[0].availableQty).toBe(500);
  });

  it('卖出超过可卖数量被拒', () => {
    const settled = settlePositions(withPosition(), TOMORROW);
    const r = placeOrder(settled, input({ side: 'sell', qty: 1500 }), 11, TOMORROW);
    expect(r.error).toContain('可卖数量不足');
  });

  it('零股卖出必须一次清仓', () => {
    // 首日买入 1000 股，次日卖出 900 股（留 100 股零股）→ 900 是 100 倍数，允许
    const settled = settlePositions(withPosition(), TOMORROW);
    const ok = placeOrder(settled, input({ side: 'sell', qty: 900 }), 11, TOMORROW);
    expect(ok.error).toBeUndefined();
    // 剩 100 股可卖时，卖 50 股（不足 100 且不等于全部持仓）→ 拒绝
    const bad = placeOrder(ok.state, input({ side: 'sell', qty: 50 }), 11, TOMORROW);
    expect(bad.error).toContain('一次性全部卖出');
  });
});

describe('限价单与撮合', () => {
  it('买入限价低于现价 → 挂单，不成交不扣款', () => {
    const r = placeOrder(createSimState(), input({ type: 'limit', price: 9.5 }), 10, TODAY);
    expect(r.error).toBeUndefined();
    expect(r.order.status).toBe('pending');
    expect(r.state.account.cash).toBe(100_000);
    expect(r.state.positions).toHaveLength(0);
  });

  it('价格到位后自动撮合成交', () => {
    const pending = placeOrder(createSimState(), input({ type: 'limit', price: 9.5 }), 10, TODAY).state;
    const { state, filled } = matchPending(pending, { '600000': 9.45 }, TODAY);
    expect(filled).toBe(1);
    expect(state.positions[0].qty).toBe(1000);
    // 以更优的现价 9.45 成交
    expect(state.orders[0].fillPrice).toBe(9.45);
  });

  it('价格未到不成交', () => {
    const pending = placeOrder(createSimState(), input({ type: 'limit', price: 9.5 }), 10, TODAY).state;
    const { filled } = matchPending(pending, { '600000': 9.8 }, TODAY);
    expect(filled).toBe(0);
  });

  it('撤单后不再撮合', () => {
    const pending = placeOrder(createSimState(), input({ type: 'limit', price: 9.5 }), 10, TODAY).state;
    const cancelled = cancelOrder(pending, pending.orders[0].id);
    expect(cancelled.orders[0].status).toBe('cancelled');
    const { filled } = matchPending(cancelled, { '600000': 9.0 }, TODAY);
    expect(filled).toBe(0);
  });
});

describe('settlePositions', () => {
  it('同日不解冻，隔日解冻', () => {
    const s = withPosition();
    expect(settlePositions(s, TODAY).positions[0].availableQty).toBe(0);
    expect(settlePositions(s, TOMORROW).positions[0].availableQty).toBe(1000);
  });

  it('无变化时返回原对象（避免无谓重渲染）', () => {
    const s = createSimState();
    expect(settlePositions(s, TOMORROW)).toBe(s);
  });
});
