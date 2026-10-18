// 图表客户端：模块③ 浏览器直连腾讯 K 线 / 分时（腾讯接口自带 Access-Control-Allow-Origin: *，
// 无需 CORS 代理；2026-10-16 实测 corsproxy.io 已改为要 API key，allorigins/codetabs 国内不稳，故全量直连）
import type { Candle, IntradayPoint } from './types';
import { parseTencentKline, parseTencentMinute } from '../worker/parse';
import { safeFetch } from './fetchSafe';
import { normalizeSymbol } from './symbol';

/** K 线周期：day 走 fqkline；m30/m60 走 mkline（分钟周期，2026-10-17 实测） */
export type KlinePeriod = 'day' | 'm30' | 'm60';

/** 腾讯日K（fqkline）：param=代码,day,,,条数,qfq（前复权）；图表固定 320 根 */
const TX_FQKLINE = (symbol: string) =>
  `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(
    symbol
  )},day,,,320,qfq`;

/**
 * 腾讯日K（fqkline，扫描专用主机）：ifzq.gtimg.cn（2026-10-18 实测 600 请求/并发 8 零 WAF 拦截，
 * 自带 Access-Control-Allow-Origin: *；web.ifzq 域名 burst 后会被腾讯 WAF 封）。
 * 市场扫描走此主机 + 60 根，与图表源（web.ifzq/320 根）域名隔离：扫描触发 WAF 不连累看图。
 */
const TX_FQKLINE_SCAN = (symbol: string, bars: number) =>
  `https://ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(
    symbol
  )},day,,,${bars},qfq`;

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
  return parseTencentMinute(await readJson(res));
}

/** fetchDaily 可选参数：bars=日K条数（默认 320）；scanHost=true 走扫描专用主机（市场模式，见 TX_FQKLINE_SCAN） */
export interface FetchDailyOptions {
  bars?: number;
  scanHost?: boolean;
}

export async function fetchDaily(
  symbol: string,
  period: KlinePeriod = 'day',
  fetchImpl: typeof fetch = safeFetch,
  opts: FetchDailyOptions = {}
): Promise<Candle[]> {
  const norm = normalizeSymbol(symbol);
  const url =
    period === 'day'
      ? opts.scanHost
        ? TX_FQKLINE_SCAN(norm, opts.bars ?? 60)
        : TX_FQKLINE(norm)
      : TX_MKLINE(norm, period);
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`K线接口返回 ${res.status}`);
  return parseTencentKline(await readJson(res), period);
}

/**
 * 读取响应体并确认是 JSON：腾讯 WAF 拦截时返回 HTML 挑战页（跳转 waf.tencent.com），
 * 若不识别会被解析成空数组、进而误判「无符合股票」。这里显式抛错，让上层记为数据缺失。
 */
async function readJson(res: Response): Promise<string> {
  const text = await res.text();
  if (!text.trimStart().startsWith('{')) {
    throw new Error('接口返回非 JSON（可能被拦截），稍后重试');
  }
  return text;
}
