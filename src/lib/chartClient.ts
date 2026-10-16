// 图表客户端：模块③ 浏览器直连腾讯 K 线 / 分时（腾讯接口自带 Access-Control-Allow-Origin: *，
// 无需 CORS 代理；2026-10-16 实测 corsproxy.io 已改为要 API key，allorigins/codetabs 国内不稳，故全量直连）
import type { Candle, IntradayPoint } from './types';
import { parseTencentKline, parseTencentMinute } from '../worker/parse';
import { safeFetch } from './fetchSafe';
import { normalizeSymbol } from './symbol';

export type KlinePeriod = 'day' | 'week' | 'month';

/** 腾讯 K 线：param=代码,周期,,,条数,qfq（前复权） */
const TX_KLINE = (symbol: string, period: KlinePeriod) =>
  `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(
    symbol
  )},${period},,,320,qfq`;

/** 腾讯分时：当日每分钟一个点 */
const TX_MINUTE = (symbol: string) =>
  `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${encodeURIComponent(symbol)}`;

export async function fetchIntraday(
  symbol: string,
  fetchImpl: typeof fetch = safeFetch
): Promise<IntradayPoint[]> {
  // 用户可能只输 6 位代码，上游要求带交易所前缀——请求前统一补全
  const res = await fetchImpl(TX_MINUTE(normalizeSymbol(symbol)));
  if (!res.ok) throw new Error(`分时接口返回 ${res.status}`);
  return parseTencentMinute(await res.text());
}

export async function fetchDaily(
  symbol: string,
  period: KlinePeriod = 'day',
  fetchImpl: typeof fetch = safeFetch
): Promise<Candle[]> {
  const res = await fetchImpl(TX_KLINE(normalizeSymbol(symbol), period));
  if (!res.ok) throw new Error(`K线接口返回 ${res.status}`);
  return parseTencentKline(await res.text(), period);
}
