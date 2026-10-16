// 图表客户端：模块③ 浏览器经公共 CORS 代理直连新浪 K 线（替代 Cloudflare Workers /api/intraday|/api/daily）
import type { Candle, IntradayPoint } from './types';
import { parseSinaDailyJson, parseSinaIntraday } from '../worker/parse';
import { corsProxyUrl } from './proxyUrl';
import { safeFetch } from './fetchSafe';
import { normalizeSymbol } from './symbol';

const SINA_KLINE = (symbol: string, scale: number) =>
  `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${encodeURIComponent(
    symbol
  )}&scale=${scale}&ma=5&datalen=320`;

export async function fetchIntraday(
  symbol: string,
  fetchImpl: typeof fetch = safeFetch
): Promise<IntradayPoint[]> {
  // 用户可能只输 6 位代码，上游要求带交易所前缀——请求前统一补全
  const res = await fetchImpl(corsProxyUrl(SINA_KLINE(normalizeSymbol(symbol), 5)));
  if (!res.ok) throw new Error(`分时代理返回 ${res.status}`);
  return parseSinaIntraday(await res.text());
}

export async function fetchDaily(
  symbol: string,
  fetchImpl: typeof fetch = safeFetch
): Promise<Candle[]> {
  const res = await fetchImpl(corsProxyUrl(SINA_KLINE(normalizeSymbol(symbol), 240)));
  if (!res.ok) throw new Error(`日K代理返回 ${res.status}`);
  return parseSinaDailyJson(await res.text());
}
