// Cloudflare Worker 入口：行情/图表代理（规避浏览器 CORS）
// 部署：wrangler deploy（需用户 Cloudflare 账号）。本地可直接 import proxyQuotes 单测。
import { proxyQuotes, type CacheEntry } from './proxy';
import { parseSinaDaily, parseSinaIntraday } from './parse';

const cache = new Map<string, CacheEntry>();

const SINA_REFERER = 'https://finance.sina.com.cn';

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/api/quotes') {
      const symbols = (url.searchParams.get('symbols') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await proxyQuotes(symbols, { fetchImpl: fetch, cache, now: Date.now() });
      return Response.json(result);
    }

    if (path === '/api/intraday') {
      const sym = url.searchParams.get('symbol') || '';
      const upstream = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sym}&type=min`;
      try {
        const res = await fetch(upstream, { headers: { Referer: SINA_REFERER } });
        const points = res.ok ? parseSinaIntraday(await res.text()) : [];
        return Response.json({ points });
      } catch {
        return Response.json({ points: [] });
      }
    }

    if (path === '/api/daily') {
      const sym = url.searchParams.get('symbol') || '';
      const upstream = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sym}&type=day`;
      try {
        const res = await fetch(upstream, { headers: { Referer: SINA_REFERER } });
        const candles = res.ok ? parseSinaDaily(await res.text()) : [];
        return Response.json({ candles });
      } catch {
        return Response.json({ candles: [] });
      }
    }

    return new Response('Not found', { status: 404 });
  }
};
