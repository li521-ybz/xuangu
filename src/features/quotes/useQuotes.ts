// 模块② 行情：按符号列表拉取（经 /api/quotes 代理），手动刷新
import { useCallback, useEffect, useState } from 'react';
import type { Quote } from '../../lib/types';
import { fetchQuotes } from '../../lib/quotesClient';
import { safeFetch } from '../../lib/fetchSafe';
import { bareSymbol } from '../../lib/symbol';

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
        // 上游返回带交易所前缀（sh601929），本地键统一用纯代码（601929），
        // 用户当初输没输前缀都能匹配上
        map[bareSymbol(q.symbol)] = q;
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
