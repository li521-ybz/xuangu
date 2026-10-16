// 图表客户端：模块③ 浏览器经公共 CORS 代理直连新浪 K 线（替代 Cloudflare Workers /api/intraday|/api/daily）
import type { Candle, IntradayPoint } from './types';
import { parseSinaDailyJson, parseSinaIntraday } from '../worker/parse';
import { corsProxyUrl } from './proxyUrl';
import { safeFetch } from './fetchSafe';

const SINA_KLINE = (symbol: string, scale: number) =>
  `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${encodeURIComponent(
    symbol
  )}&scale=${scale}&ma=5&datalen=320`;

export async function fetchIntraday(
  symbol: string,
  fetchImpl: typeof fetch = safeFetch
): Promise<IntradayPoint[]> {
  // scale=5 为 5 分钟 K，用作分时近似（真实分时接口需另行验证）
  const res = await fetchImpl(corsProxyUrl(SINA_KLINE(symbol, 5)));
  if (!res.ok) throw new Error(`分时代理返回 ${res.status}`);
  return parseSinaIntraday(await res.text());
}

export async function fetchDaily(
  symbol: string,
  fetchImpl: typeof fetch = safeFetch
): Promise<Candle[]> {
  // scale=240 为日 K
  const res = await fetchImpl(corsProxyUrl(SINA_KLINE(symbol, 240)));
  if (!res.ok) throw new Error(`日K代理返回 ${res.status}`);
  return parseSinaDailyJson(await res.text());
}
