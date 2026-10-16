// Workers 行情代理核心逻辑（可单测，不依赖部署）
// 职责：转发免费接口、加缓存/限流、上游失败时降级（沿用缓存或标记 degraded）
import type { Quote } from '../lib/types';
import { parseQuotesBatch } from './parse';

export interface CacheEntry {
  quote: Quote;
  t: number;
}

export interface ProxyOptions {
  fetchImpl: typeof fetch;
  cache: Map<string, CacheEntry>;
  now: number;
  ttlMs?: number; // 缓存有效时长（ms），默认 10000
  upstreamUrl?: (symbols: string[]) => string; // 便于测试注入
}

export interface ProxyResult {
  quotes: Quote[];
  degraded: boolean; // 是否有股票完全无数据（上游失败且无缓存）
  fromCache: number;
}

const SINA_URL = (symbols: string[]) => `https://hq.sinajs.cn/list=${symbols.join(',')}`;

export async function proxyQuotes(symbols: string[], opts: ProxyOptions): Promise<ProxyResult> {
  const ttl = opts.ttlMs ?? 10000;
  const quotes: Quote[] = [];
  let degraded = false;
  let fromCache = 0;

  const needFetch = symbols.filter((s) => {
    const c = opts.cache.get(s);
    return !(c && opts.now - c.t <= ttl);
  });

  if (needFetch.length > 0) {
    const url = opts.upstreamUrl ? opts.upstreamUrl(needFetch) : SINA_URL(needFetch);
    try {
      const res = await opts.fetchImpl(url);
      if (res.ok) {
        const raw = await res.text();
        for (const q of parseQuotesBatch(raw)) {
          opts.cache.set(q.symbol, { quote: q, t: opts.now });
        }
      }
    } catch {
      // 上游失败：忽略，下方回退到已有缓存（若有）
    }
  }

  for (const sym of symbols) {
    const c = opts.cache.get(sym);
    if (c) {
      quotes.push(c.quote);
      if (opts.now - c.t <= ttl) fromCache++;
    } else {
      degraded = true; // 既无缓存也无数据 -> 降级
    }
  }

  return { quotes, degraded, fromCache };
}
