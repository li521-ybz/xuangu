// 模块④ 选股编排：两段式拉取（日K 粗筛主条件 → 分钟K 精筛买点），进度可见
// 复用模块③ 的 fetchDaily（腾讯直连），不引入新数据源；并发受限避免打满上游。
import { useCallback, useRef, useState } from 'react';
import type { Candle, Stock } from '../../lib/types';
import { fetchDaily } from '../../lib/chartClient';
import { safeFetch } from '../../lib/fetchSafe';
import { bareSymbol } from '../../lib/symbol';
import {
  DEFAULT_TOGGLES,
  evalBuyPoint,
  evalMainConditions,
  type BuyPointResult,
  type ConditionToggles,
  type MainResult
} from './conditions';

export type ScreenStatus = 'hit' | 'candidate' | 'no-data';

export interface ScreenRow {
  stock: Stock;
  status: ScreenStatus;
  main?: MainResult;
  buy?: BuyPointResult;
  day?: Candle[]; // 主条件用过的日K（买点评估复用，不重复拉取）
  note?: string;
}

/** 并发受限的顺序映射（保持输入顺序；空数组直接返回） */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function useScreener(stocks: Stock[], fetchImpl: typeof fetch = safeFetch) {
  const [rows, setRows] = useState<ScreenRow[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [toggles, setToggles] = useState<ConditionToggles>(DEFAULT_TOGGLES);
  const runId = useRef(0); // 连续点击/退出时旧任务结果作废

  const run = useCallback(async () => {
    const id = ++runId.current;
    setRunning(true);
    setRows([]);
    const results: ScreenRow[] = [];
    try {
      // 第一段：日K → 主条件（涨停窗口/缩量/不破位）
      let done = 0;
      await mapLimit(stocks, 6, async (s) => {
        if (id !== runId.current) return;
        setProgress(`拉取日K ${++done}/${stocks.length}`);
        try {
          const day = await fetchDaily(s.symbol, 'day', fetchImpl);
          const main = evalMainConditions(day, { code: bareSymbol(s.symbol), name: s.name, toggles });
          if (main.pass) results.push({ stock: s, status: 'candidate', main, day });
        } catch (e) {
          results.push({ stock: s, status: 'no-data', note: `日K拉取失败：${(e as Error).message}` });
        }
      });

      // 第二段：仅主条件通过者拉分钟K → 买点分支评估
      const survivors = results.filter((r) => r.status === 'candidate');
      let bd = 0;
      await mapLimit(survivors, 4, async (r) => {
        if (id !== runId.current) return;
        setProgress(`分析买点 ${++bd}/${survivors.length}`);
        try {
          const [m30, m60] = await Promise.all([
            fetchDaily(r.stock.symbol, 'm30', fetchImpl),
            fetchDaily(r.stock.symbol, 'm60', fetchImpl)
          ]);
          const buy = evalBuyPoint({
            dayCandles: r.day as Candle[],
            m30,
            m60,
            daysSinceLimitUp: (r.main as MainResult).daysSinceLimitUp,
            toggles
          });
          r.buy = buy;
          r.status = buy.pass ? 'hit' : 'candidate';
        } catch (e) {
          r.note = `分钟K拉取失败：${(e as Error).message}`;
        }
      });

      if (id !== runId.current) return;
      const order: Record<ScreenStatus, number> = { hit: 0, candidate: 1, 'no-data': 2 };
      setRows([...results].sort((a, b) => order[a.status] - order[b.status]));
      setProgress('');
    } finally {
      if (id === runId.current) setRunning(false);
    }
  }, [stocks, toggles, fetchImpl]);

  const toggle = useCallback((key: keyof ConditionToggles) => {
    setToggles((t) => ({ ...t, [key]: !t[key] }));
  }, []);

  return { rows, running, progress, toggles, toggle, run };
}
