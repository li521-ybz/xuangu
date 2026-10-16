// 模块② 行情：按符号列表拉取（经 /api/quotes 代理），手动刷新
import { useCallback, useEffect, useState } from 'react';
import type { Quote } from '../../lib/types';
import { fetchQuotes } from '../../lib/quotesClient';
import { safeFetch } from '../../lib/fetchSafe';

export function useQuotes(symbols: string[], fetchImpl: typeof fetch = safeFetch) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);

  const refresh = useCallback(async () => {
    const key = symbols.join(',');
    if (symbols.length === 0) {
      setQuotes({});
      return;
    }
    setLoading(true);
    setError(null);
    setDegraded(false);
    try {
      const res = await fetchQuotes(symbols, fetchImpl);
      const map: Record<string, Quote> = {};
      res.quotes.forEach((q) => {
        map[q.symbol] = q;
      });
      setQuotes(map);
      setDegraded(!!res.degraded);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [symbols.join(','), fetchImpl]);

  useEffect(() => {
    void refresh();
    // symbols 变化时才重新拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')]);

  return { quotes, loading, error, degraded, refresh };
}
