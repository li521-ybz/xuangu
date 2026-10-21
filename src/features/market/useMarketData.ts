// 模块① 看盘总览：指数条 + 全市场快照（带 60 秒内存缓存与并发去重）
import { useCallback, useEffect, useRef, useState } from 'react';
import type { IndexQuote, MarketSnapshot } from '../../lib/types';
import { fetchQuotes } from '../../lib/quotesClient';
import { fetchMarketSnapshot } from '../../lib/marketStats';

/** 五大指数（用户口径：上证 / 深成 / 创业板 / 科创50 / 沪深300） */
export const INDEX_LIST: Array<{ symbol: string; label: string }> = [
  { symbol: 'sh000001', label: '上证指数' },
  { symbol: 'sz399001', label: '深证成指' },
  { symbol: 'sz399006', label: '创业板指' },
  { symbol: 'sh000688', label: '科创50' },
  { symbol: 'sh000300', label: '沪深300' }
];

const INDEX_TTL = 20_000;
const SNAP_TTL = 60_000;

let indexCache: { at: number; list: IndexQuote[] } | null = null;
let indexInflight: Promise<IndexQuote[]> | null = null;

let snapCache: { at: number; snap: MarketSnapshot } | null = null;
let snapInflight: Promise<MarketSnapshot> | null = null;

/** 指数行情：20 秒缓存，页面内多组件共用同一份 */
export function useIndices(pollMs = 30_000) {
  const [list, setList] = useState<IndexQuote[]>(indexCache?.list ?? []);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (!force && indexCache && Date.now() - indexCache.at < INDEX_TTL) {
      setList(indexCache.list);
      return;
    }
    try {
      indexInflight =
        indexInflight ??
        (async () => {
          const res = await fetchQuotes(INDEX_LIST.map((i) => i.symbol));
          return res.quotes.map((q) => ({
            symbol: q.symbol,
            name: q.name,
            price: q.price,
            change: q.change,
            changePct: q.changePct
          }));
        })();
      const next = await indexInflight;
      indexInflight = null;
      indexCache = { at: Date.now(), list: next };
      setList(next);
      setError(null);
    } catch (e) {
      indexInflight = null;
      setError(e instanceof Error ? e.message : '指数行情加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(true), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  return { list, error, refresh: () => load(true) };
}

/** 全市场快照：60 秒缓存；首次（腾讯兜底）较慢，带进度文案 */
export function useMarketSnapshot() {
  const [snap, setSnap] = useState<MarketSnapshot | null>(snapCache?.snap ?? null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(
    async (force = false) => {
      if (!force && snapCache && Date.now() - snapCache.at < SNAP_TTL) {
        setSnap(snapCache.snap);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        snapInflight =
          snapInflight ??
          fetchMarketSnapshot(undefined, (msg) => {
            if (alive.current) setProgress(msg);
          });
        const next = await snapInflight;
        snapInflight = null;
        snapCache = { at: Date.now(), snap: next };
        if (alive.current) setSnap(next);
      } catch (e) {
        snapInflight = null;
        if (alive.current) setError(e instanceof Error ? e.message : '全市场快照加载失败');
      } finally {
        if (alive.current) {
          setLoading(false);
          setProgress('');
        }
      }
    },
    []
  );

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  return { snap, loading, progress, error, refresh: () => load(true) };
}
