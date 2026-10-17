// 图表客户端：模块③ 浏览器直连腾讯 K 线 / 分时（腾讯接口自带 Access-Control-Allow-Origin: *，
// 无需 CORS 代理；2026-10-16 实测 corsproxy.io 已改为要 API key，allorigins/codetabs 国内不稳，故全量直连）
import type { Candle, IntradayPoint } from './types';
import { parseTencentKline, parseTencentMinute } from '../worker/parse';
import { safeFetch } from './fetchSafe';
import { normalizeSymbol } from './symbol';

/** K 线周期：day 走 fqkline；m30/m60 走 mkline（分钟周期，2026-10-17 实测） */
export type KlinePeriod = 'day' | 'm30' | 'm60';

/** 腾讯日K（fqkline）：param=代码,day,,,条数,qfq（前复权） */
const TX_FQKLINE = (symbol: string) =>
  `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(
    symbol
  )},day,,,320,qfq`;

/**
 * 腾讯分钟K（mkline）：param=代码,周期,,,条数。
 * 注意两个分流原因（2026-10-17 curl 实测）：fqkline 对 m30/m60 返回 {"code":1,"msg":"bad params"}；
 * mkline 对 day 返回 {"code":-1,"msg":"param error"}。mkline 用 ifzq.gtimg.cn 域名
 * （web.ifzq.gtimg.cn 会 301 跳转），实测自带 Access-Control-Allow-Origin: *。
 */
const TX_MKLINE = (symbol: string, period: KlinePeriod) =>
  `https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=${encodeURIComponent(
    symbol
  )},${period},,,320`;

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
  const url = period === 'day' ? TX_FQKLINE(normalizeSymbol(symbol)) : TX_MKLINE(normalizeSymbol(symbol), period);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`K线接口返回 ${res.status}`);
  return parseTencentKline(await res.text(), period);
}
