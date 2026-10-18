// 选股编排测试：两段式结构、范围参数透传、日K新鲜度、停止/重置
// 策略引擎（conditions）与数据源（chartClient）在此 mock，只验编排逻辑
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScreener } from './useScreener';
import { fetchDaily } from '../../lib/chartClient';
import { evalMainConditions, evalBuyPoint } from './conditions';
import type { Candle, Stock } from '../../lib/types';
import type { KlinePeriod } from '../../lib/chartClient';

vi.mock('../../lib/chartClient', () => ({ fetchDaily: vi.fn() }));
vi.mock('./conditions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./conditions')>();
  return { ...actual, evalMainConditions: vi.fn(), evalBuyPoint: vi.fn() };
});

const MAIN_PASS = {
  pass: true,
  limitUpIndex: 5,
  daysSinceLimitUp: 4,
  shrinkActual: 0.42,
  failReasons: []
};
const BUY_PASS = {
  pass: true,
  branch: 'near' as const,
  checks: { closeAboveMa10: true, bollNarrow: true, maCross: true },
  failReasons: []
};

function stock(symbol: string): Stock {
  return { id: symbol, symbol, name: `股票${symbol}`, group: '观察' };
}

/** 生成日K；date 传具体日期控制新鲜度 */
function dayCandles(date: string, n = 30): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
    open: 10,
    high: 10.5,
    low: 9.5,
    close: 10,
    volume: 1000
  })).map((c, i) => (i === n - 1 ? { ...c, date } : c));
}

/** 最近一个交易日（今天）的日K */
const FRESH = () => dayCandles(new Date().toISOString().slice(0, 10));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(evalMainConditions).mockReturnValue(MAIN_PASS);
  vi.mocked(evalBuyPoint).mockReturnValue(BUY_PASS);
});

describe('useScreener 编排', () => {
  it('自选默认口径：日K 320 根默认主机；不过主条件的股票不进结果；scanned 计全量', async () => {
    const day = FRESH();
    vi.mocked(fetchDaily).mockImplementation(async (symbol: string, period?: KlinePeriod) => {
      if (period !== 'day') return [];
      return day;
    });
    vi.mocked(evalMainConditions).mockImplementation((_c, opts) =>
      opts?.code === '600000'
        ? MAIN_PASS
        : { ...MAIN_PASS, pass: false, failReasons: ['窗口内无涨停'] }
    );

    const { result } = renderHook(() => useScreener([stock('sh600000'), stock('sz000001')]));
    await act(async () => {
      await result.current.run();
    });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].stock.symbol).toBe('sh600000');
    expect(result.current.rows[0].status).toBe('hit'); // 买点段 mock 默认通过
    expect(result.current.scanned).toBe(2);
    // 默认口径：320 根、不走扫描主机（并发下首调顺序不定，按代码取）
    const call = vi
      .mocked(fetchDaily)
      .mock.calls.find((c) => c[0] === 'sh600000' && c[1] === 'day');
    expect(call).toEqual(['sh600000', 'day', expect.any(Function), { bars: 320, scanHost: undefined }]);
  });

  it('市场口径：bars/scanHost/并发参数透传给日K；买点段只对通过者拉分钟K', async () => {
    const day = FRESH();
    vi.mocked(fetchDaily).mockImplementation(async (symbol: string, period?: KlinePeriod) =>
      period === 'day' ? day : []
    );

    const { result } = renderHook(() =>
      useScreener([stock('sh600000'), stock('sz000001')], {
        bars: 60,
        concurrency: 8,
        scanHost: true
      })
    );
    await act(async () => {
      await result.current.run();
    });

    const dayCalls = vi.mocked(fetchDaily).mock.calls.filter((c) => c[1] === 'day');
    expect(dayCalls).toHaveLength(2);
    dayCalls.forEach((c) => expect(c[3]).toEqual({ bars: 60, scanHost: true }));
    const minuteCalls = vi.mocked(fetchDaily).mock.calls.filter((c) => c[1] !== 'day');
    expect(minuteCalls).toHaveLength(4); // 2 只都过主条件 → 各拉一对 m30/m60
    expect(minuteCalls.map((c) => c[1]).sort()).toEqual(['m30', 'm30', 'm60', 'm60']);
    expect(result.current.rows.every((r) => r.status === 'hit')).toBe(true);
  });

  it('陈旧日K（最后交易日超过阈值）→ 记数据缺失，不进主条件评估', async () => {
    vi.mocked(fetchDaily).mockResolvedValue(dayCandles('2020-01-01'));
    const { result } = renderHook(() => useScreener([stock('sh600000')], { staleDays: 20 }));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].status).toBe('no-data');
    expect(result.current.rows[0].note).toContain('数据陈旧');
    expect(evalMainConditions).not.toHaveBeenCalled();
  });

  it('新鲜度阈值内（如 10 天）正常评估', async () => {
    const d = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    vi.mocked(fetchDaily).mockResolvedValue(dayCandles(d));
    const { result } = renderHook(() => useScreener([stock('sh600000')], { staleDays: 20 }));
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.rows[0].status).not.toBe('no-data');
  });

  it('停止：作废运行、不出结果；reset：清空已有结果', async () => {
    vi.mocked(fetchDaily).mockImplementation(
      () => new Promise<Candle[]>(() => {}) // 永不返回
    );
    const { result } = renderHook(() => useScreener([stock('sh600000'), stock('sz000001')]));
    await act(async () => {
      void result.current.run();
    });
    expect(result.current.running).toBe(true);
    act(() => result.current.cancel());
    expect(result.current.running).toBe(false);
    expect(result.current.rows).toHaveLength(0);

    // reset：先造一批结果再清空
    vi.mocked(fetchDaily).mockImplementation(async (_s, period?: KlinePeriod) =>
      period === 'day' ? FRESH() : []
    );
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.rows.length).toBeGreaterThan(0);
    act(() => result.current.reset());
    expect(result.current.rows).toHaveLength(0);
    expect(result.current.scanned).toBe(0);
  });
});
