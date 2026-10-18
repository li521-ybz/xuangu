// 市场模式名单 hook（2026-10-18）：进入「沪深A股」范围才拉取；缓存优先展示；
// 拉取失败无缓存时报错（面板给重试），有旧缓存则降级沿用并提示。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Stock } from '../../lib/types';
import { safeFetch } from '../../lib/fetchSafe';
import {
  fetchMarketRoster,
  loadCachedRoster,
  saveCachedRoster,
  todayStr,
  type MarketRoster
} from '../../lib/marketList';

export interface RosterState {
  stocks: Stock[];
  source: MarketRoster['source'] | null;
  date: string | null; // 名单日期 YYYY-MM-DD
  loading: boolean;
  error: string | null; // 致命错误（无缓存可用）
  note: string | null; // 非致命提示（如刷新失败沿用旧缓存）
  refresh: () => void; // 强制重新拉取（忽略当天已加载标记）
}

export function useMarketRoster(active: boolean, fetchImpl: typeof fetch = safeFetch): RosterState {
  const [roster, setRoster] = useState<MarketRoster | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadedDate = useRef<string | null>(null); // 本次会话已成功拉取的日期（避免重复请求）

  useEffect(() => {
    if (!active) return;
    const today = todayStr();
    const cached = loadCachedRoster();
    if (cached) setRoster(cached); // 有缓存先展示（可能是昨天的）
    if (loadedDate.current === today) return; // 今天已拉过：缓存即最新，零请求

    let cancelled = false;
    setLoading(true);
    setError(null);
    setNote(null);
    void fetchMarketRoster(fetchImpl)
      .then((r) => {
        if (cancelled) return;
        loadedDate.current = today;
        setRoster(r);
        saveCachedRoster(r);
        if (cached && cached.date !== today) setNote(`名单已更新（${cached.date} → ${r.date}）`);
      })
      .catch((e) => {
        if (cancelled) return;
        if (cached) {
          setNote(`名单刷新失败（${(e as Error).message}），沿用 ${cached.date} 缓存`);
        } else {
          setError(`名单获取失败：${(e as Error).message}`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, nonce, fetchImpl]);

  const refresh = useCallback(() => {
    loadedDate.current = null; // 强制重拉，即使今天已加载过
    setNonce((n) => n + 1);
  }, []);

  return {
    stocks: roster?.stocks ?? [],
    source: roster?.source ?? null,
    date: roster?.date ?? null,
    loading,
    error,
    note,
    refresh
  };
}
