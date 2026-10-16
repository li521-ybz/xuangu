// 阶段2 代理：缓存/限流/降级（纯函数，注入 fake fetch）
import { describe, it, expect } from 'vitest';
import { proxyQuotes, type CacheEntry } from '../../worker/proxy';
import { parseSinaLine } from '../../worker/parse';

const RAW =
  'var hq_str_sh600000="浦发银行,11.05,11.00,11.20,11.30,10.90,11.20"';

function okFetch(raw: string) {
  return async () => ({ ok: true, text: async () => raw }) as any;
}
function failFetch() {
  return async () => {
    throw new Error('network');
  };
}

describe('proxyQuotes', () => {
  it('缓存新鲜时不请求上游', async () => {
    const cache = new Map<string, CacheEntry>();
    cache.set('sh600000', { quote: parseSinaLine(RAW)!, t: 1000 });
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return { ok: true, text: async () => RAW } as any;
    };
    const r = await proxyQuotes(['sh600000'], { fetchImpl, cache, now: 1000 + 5000, ttlMs: 10000 });
    expect(calls).toBe(0); // 命中缓存
    expect(r.fromCache).toBe(1);
    expect(r.quotes[0].symbol).toBe('sh600000');
  });

  it('缓存过期则请求并写入缓存', async () => {
    const cache = new Map<string, CacheEntry>();
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return { ok: true, text: async () => RAW } as any;
    };
    const r = await proxyQuotes(['sh600000'], { fetchImpl, cache, now: 2000, ttlMs: 10000 });
    expect(r.quotes.length).toBe(1);
    expect(cache.has('sh600000')).toBe(true);
    expect(calls).toBe(1); // 确实请求了上游
  });

  it('上游失败且无缓存 -> degraded', async () => {
    const cache = new Map<string, CacheEntry>();
    const r = await proxyQuotes(['sh600000'], { fetchImpl: failFetch() as any, cache, now: 2000 });
    expect(r.degraded).toBe(true);
    expect(r.quotes.length).toBe(0);
  });

  it('上游失败但有旧缓存 -> 降级兜底使用缓存（不报错）', async () => {
    const cache = new Map<string, CacheEntry>();
    cache.set('sh600000', { quote: parseSinaLine(RAW)!, t: 0 });
    const r = await proxyQuotes(['sh600000'], { fetchImpl: failFetch() as any, cache, now: 999999 });
    expect(r.degraded).toBe(false);
    expect(r.quotes.length).toBe(1);
  });
});
