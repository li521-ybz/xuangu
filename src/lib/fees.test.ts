// A 股费用口径测试：持仓 / 模拟盘 / 回测三处共用，错一分钱都会影响收益结论
import { describe, it, expect } from 'vitest';
import { calcFee, dilutedCost, isLotAligned } from './fees';

describe('calcFee', () => {
  it('买入：佣金 + 过户费，无印花税', () => {
    const f = calcFee('buy', 10, 10_000); // 成交额 10 万
    expect(f.commission).toBeCloseTo(25, 2); // 10 万 × 0.025%
    expect(f.stampTax).toBe(0);
    expect(f.transferFee).toBeCloseTo(1, 2); // 10 万 × 0.001%
    expect(f.total).toBeCloseTo(26, 2);
  });

  it('卖出：佣金 + 印花税 0.05% + 过户费', () => {
    const f = calcFee('sell', 10, 10_000);
    expect(f.commission).toBeCloseTo(25, 2);
    expect(f.stampTax).toBeCloseTo(50, 2);
    expect(f.transferFee).toBeCloseTo(1, 2);
    expect(f.total).toBeCloseTo(76, 2);
  });

  it('佣金有 5 元最低：小额单按 5 元计', () => {
    // 1000 元买入，0.025% = 0.25 元 → 取 5 元
    const f = calcFee('buy', 10, 100);
    expect(f.commission).toBe(5);
    expect(f.total).toBeCloseTo(5.01, 2); // 5 + 过户费 0.01
  });

  it('金额为 0 时不收费', () => {
    expect(calcFee('buy', 0, 100).total).toBe(0);
    expect(calcFee('sell', 10, 0).total).toBe(0);
  });
});

describe('isLotAligned', () => {
  it('买入须 100 股整数倍', () => {
    expect(isLotAligned(100)).toBe(true);
    expect(isLotAligned(1500)).toBe(true);
    expect(isLotAligned(150)).toBe(false);
    expect(isLotAligned(0)).toBe(false);
    expect(isLotAligned(-100)).toBe(false);
  });
});

describe('dilutedCost', () => {
  it('买入费用摊薄进每股成本', () => {
    // 10 元 × 100 股 + 5.01 元费用 = 1005.01 → 10.0501
    expect(dilutedCost(10, 100, 5.01)).toBeCloseTo(10.0501, 4);
  });
});
