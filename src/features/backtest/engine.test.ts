// 回测引擎测试：重点是「无未来函数」——T 日信号必须 T+1 开盘成交
import { describe, it, expect } from 'vitest';
import type { Candle } from '../../lib/types';
import { defaultParams, ema, macd, runBacktest, sma, strategyByKey } from './engine';

function candle(i: number, o: number, c: number, h = Math.max(o, c) + 0.1, l = Math.min(o, c) - 0.1, v = 1000): Candle {
  const d = new Date(Date.UTC(2026, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return {
    date: d.toISOString().slice(0, 10),
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v
  };
}

describe('sma / ema / macd', () => {
  it('sma 前 n-1 个为 NaN，之后为均值', () => {
    const s = sma([1, 2, 3, 4, 5], 3);
    expect(Number.isNaN(s[0])).toBe(true);
    expect(Number.isNaN(s[1])).toBe(true);
    expect(s[2]).toBeCloseTo(2, 6);
    expect(s[4]).toBeCloseTo(4, 6);
  });

  it('ema 首值等于首输入，随序列平滑', () => {
    const e = ema([10, 10, 10], 5);
    expect(e[0]).toBe(10);
    expect(e[2]).toBeCloseTo(10, 6);
  });

  it('macd 输出 DIF 与 DEA，长度与输入一致', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 10 + Math.sin(i / 4) * 2);
    const { dif, dea } = macd(closes, 12, 26, 9);
    expect(dif).toHaveLength(60);
    expect(dea).toHaveLength(60);
    expect(Number.isFinite(dif[59])).toBe(true);
  });
});

describe('runBacktest：T+1 成交（无未来函数）', () => {
  /** 前 30 根横盘 10 元，第 30 根收盘 11 元（突破 20 日新高），第 31 根开盘 12 元 */
  function breakoutSeries(): Candle[] {
    const out: Candle[] = [];
    for (let i = 0; i < 30; i += 1) out.push(candle(i, 10, 10, 10.05, 9.95));
    out.push(candle(30, 10, 11, 11.1, 9.95)); // 信号日（收盘 11 > 前 20 日最高 10.05）
    out.push(candle(31, 12, 12.2, 12.3, 11.9)); // 次日开盘 12 → 应在此成交
    for (let i = 32; i < 40; i += 1) out.push(candle(i, 12.2, 12.3, 12.4, 12.1));
    return out;
  }

  it('信号日收盘价不用于成交，买入价是次日开盘价', () => {
    const res = runBacktest(breakoutSeries(), {
      strategyKey: 'breakout',
      params: { lookback: 20 },
      maxHoldDays: 0,
      stopLossPct: 0,
      takeProfitPct: 0
    });
    expect(res.trades.length).toBeGreaterThanOrEqual(1);
    expect(res.trades[0].inPrice).toBe(12); // 次日开盘，不是信号日收盘 11
  });

  it('持仓按收盘价估值，期末强制平仓', () => {
    const res = runBacktest(breakoutSeries(), {
      strategyKey: 'breakout',
      params: { lookback: 20, long: 5 },
      maxHoldDays: 0,
      stopLossPct: 0,
      takeProfitPct: 0
    });
    const last = res.trades[res.trades.length - 1];
    expect(last.reason).toBe('期末平仓');
    expect(res.finalCash).toBeGreaterThan(100_000);
    expect(res.equity).toHaveLength(10); // 第 30..39 根共 10 个估值点
  });

  it('最长持有天数到点卖出（次日开盘执行）', () => {
    const res = runBacktest(breakoutSeries(), {
      strategyKey: 'breakout',
      params: { lookback: 20, long: 5 },
      maxHoldDays: 2,
      stopLossPct: 0,
      takeProfitPct: 0
    });
    expect(res.trades.length).toBeGreaterThanOrEqual(1);
    expect(res.trades[0].reason).toContain('持有满');
    // 第 31 根开盘买入；持满 2 日（i=33）产生卖出信号 → 第 34 根开盘成交，索引差 3
    expect(res.trades[0].days).toBe(3);
    expect(res.trades[0].outPrice).toBe(12.2);
  });

  it('止损触发', () => {
    // 信号后次日开盘 12，随后跌到 10（跌幅 > 10%）→ 止损 5% 必然触发
    const series = breakoutSeries();
    series[34] = candle(34, 11, 10.2, 11.1, 10.1);
    series[35] = candle(35, 10.2, 10, 10.3, 9.9);
    const res = runBacktest(series, {
      strategyKey: 'breakout',
      params: { lookback: 20, long: 5 },
      maxHoldDays: 0,
      stopLossPct: 5,
      takeProfitPct: 0
    });
    expect(res.trades[0]?.reason).toContain('止损');
  });

  it('无信号时不交易，资金保持不变', () => {
    const flat: Candle[] = Array.from({ length: 60 }, (_, i) => candle(i, 10, 10, 10.05, 9.95));
    const res = runBacktest(flat, {
      strategyKey: 'breakout',
      params: { lookback: 20 },
      maxHoldDays: 0,
      stopLossPct: 0,
      takeProfitPct: 0
    });
    expect(res.trades).toHaveLength(0);
    expect(res.finalCash).toBe(100_000);
    expect(res.summary.totalReturn).toBe(0);
  });

  it('K 线少于 30 根返回空结果', () => {
    const res = runBacktest([candle(0, 10, 10)], {
      strategyKey: 'breakout',
      params: {},
      maxHoldDays: 0,
      stopLossPct: 0,
      takeProfitPct: 0
    });
    expect(res.trades).toHaveLength(0);
    expect(res.equity).toHaveLength(0);
  });

  it('买入按整手向下取整，费用计入', () => {
    const res = runBacktest(breakoutSeries(), {
      strategyKey: 'breakout',
      params: { lookback: 20, long: 5 },
      maxHoldDays: 0,
      stopLossPct: 0,
      takeProfitPct: 0
    });
    const t = res.trades[0];
    expect(t.qty % 100).toBe(0);
    expect(t.fee).toBeGreaterThan(0);
  });
});

describe('策略注册表', () => {
  it('五个策略都有默认参数与描述', () => {
    for (const key of ['maCross', 'breakout', 'oversold', 'volBreak', 'macdCross']) {
      const s = strategyByKey(key);
      expect(s.key).toBe(key);
      expect(s.desc.length).toBeGreaterThan(0);
      const p = defaultParams(s);
      for (const param of s.params) expect(p[param.key]).toBe(param.default);
    }
  });

  it('未知策略键回落第一个策略（不抛错）', () => {
    expect(strategyByKey('nope').key).toBe('maCross');
  });
});
