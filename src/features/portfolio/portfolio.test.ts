// 持仓成本口径测试：移动加权 + 卖出实现盈亏（券商账单对齐）
import { describe, it, expect } from 'vitest';
import { buildHoldings, summarizePortfolio, withQuotes } from './portfolio';
import type { Trade } from '../../lib/types';

function trade(p: Partial<Trade> & { side: 'buy' | 'sell'; price: number; qty: number }): Trade {
  return {
    id: `${p.side}-${p.price}-${p.qty}-${Math.random()}`,
    symbol: 'sh600000',
    name: '浦发银行',
    fee: 0,
    date: '2026-10-01',
    ...p
  } as Trade;
}

describe('buildHoldings', () => {
  it('两次买入：成本按加权平均，费用摊薄进成本', () => {
    const { holdings } = buildHoldings([
      trade({ side: 'buy', price: 10, qty: 1000, fee: 5 }),
      trade({ side: 'buy', price: 12, qty: 1000, fee: 5, date: '2026-10-02' })
    ]);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].qty).toBe(2000);
    // (10*1000+5) + (12*1000+5) = 22010 → 11.005
    expect(holdings[0].cost).toBeCloseTo(11.005, 4);
    expect(holdings[0].costAmount).toBeCloseTo(22010, 2);
  });

  it('部分卖出：成本价不变，按比例转出成本，实现盈亏扣费用', () => {
    const { holdings, realizedTotal } = buildHoldings([
      trade({ side: 'buy', price: 10, qty: 1000, fee: 5 }),
      trade({ side: 'sell', price: 13, qty: 500, fee: 8, date: '2026-10-03' })
    ]);
    expect(holdings[0].qty).toBe(500);
    expect(holdings[0].cost).toBeCloseTo(10.005, 4);
    // 卖出净额 6500 - 8 = 6492；转出成本 500*10.005 = 5002.5 → 盈亏 1489.5
    expect(realizedTotal).toBeCloseTo(1489.5, 2);
    expect(holdings[0].costAmount).toBeCloseTo(5002.5, 2);
  });

  it('全部清仓：不在持仓列表里，但已实现盈亏累计', () => {
    const { holdings, realizedTotal } = buildHoldings([
      trade({ side: 'buy', price: 10, qty: 100, fee: 5 }),
      trade({ side: 'sell', price: 11, qty: 100, fee: 5, date: '2026-10-05' })
    ]);
    expect(holdings).toHaveLength(0);
    // 1100 - 5 - 1005 = 90
    expect(realizedTotal).toBeCloseTo(90, 2);
  });

  it('卖出超过持仓：按持仓量截断，不出现负数量', () => {
    const { holdings } = buildHoldings([
      trade({ side: 'buy', price: 10, qty: 100, fee: 0 }),
      trade({ side: 'sell', price: 11, qty: 500, fee: 0, date: '2026-10-02' })
    ]);
    expect(holdings).toHaveLength(0);
  });

  it('按日期排序后再算成本（乱序录入不影响结果）', () => {
    const { holdings } = buildHoldings([
      trade({ side: 'sell', price: 12, qty: 500, fee: 0, date: '2026-10-05' }),
      trade({ side: 'buy', price: 10, qty: 1000, fee: 0, date: '2026-10-01' })
    ]);
    expect(holdings[0].qty).toBe(500);
    expect(holdings[0].cost).toBeCloseTo(10, 4);
  });
});

describe('withQuotes / summarizePortfolio', () => {
  const { holdings } = buildHoldings([
    { id: 'a', symbol: 'sh600000', name: '浦发银行', side: 'buy', price: 10, qty: 1000, fee: 0, date: '2026-10-01' }
  ]);
  const { holdings: h2 } = buildHoldings([
    { id: 'b', symbol: 'sz000001', name: '平安银行', side: 'buy', price: 20, qty: 1000, fee: 0, date: '2026-10-01' }
  ]);

  it('市值/浮动盈亏/当日盈亏/仓位占比', () => {
    const rows = withQuotes([...holdings, ...h2], {
      '600000': { price: 11, prevClose: 10.5, changePct: 4.76 },
      '000001': { price: 18, prevClose: 19, changePct: -5.26 }
    });
    const pf = rows.find((r) => r.symbol === 'sh600000')!;
    expect(pf.marketValue).toBeCloseTo(11000, 2);
    expect(pf.floatPnl).toBeCloseTo(1000, 2);
    expect(pf.dayPnl).toBeCloseTo(500, 2); // 1000 × (11 - 10.5)
    expect(pf.weight).toBeCloseTo((11000 / 29000) * 100, 3);

    const sum = summarizePortfolio(rows, 0);
    expect(sum.marketValue).toBeCloseTo(29000, 2);
    expect(sum.costAmount).toBeCloseTo(30000, 2);
    expect(sum.floatPnl).toBeCloseTo(-1000, 2);
    expect(sum.dayPnl).toBeCloseTo(-500, 2); // 500 + (18-19)*1000
    expect(sum.count).toBe(2);
  });

  it('取不到行情时用成本价估值，不显示 0 市值', () => {
    const rows = withQuotes(holdings, {});
    expect(rows[0].marketValue).toBeCloseTo(10000, 2);
    expect(rows[0].floatPnl).toBeCloseTo(0, 2);
  });
});
