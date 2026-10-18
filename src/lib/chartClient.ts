// 图表客户端：模块③ 浏览器直连腾讯 K 线 / 分时（腾讯接口自带 Access-Control-Allow-Origin: *，
// 无需 CORS 代理；2026-10-16 实测 corsproxy.io 已改为要 API key，allorigins/codetabs 国内不稳，故全量直连）
import type { Candle, IntradayPoint } from './types';
import { parseTencentKline, parseTencentMinute } from '../worker/parse';
import { safeFetch } from './fetchSafe';
import { normalizeSymbol } from './symbol';

/** K 线周期：day 走 fqkline；m30/m60 走 mkline（分钟周期，2026-10-17 实测） */
export type KlinePeriod = 'day' | 'm30' | 'm60';

/**
 * 日K fqkline 双主机 + 故障转移（2026-10-18 晚修「数据缺失」故障）：
 * - web.ifzq：图表源（320 根），当晚实测 200 + Access-Control-Allow-Origin: *
 * - ifzq：扫描源（60 根），其 fqkline 路径当晚被腾讯 WAF 拦截（501 JS 挑战页、
 *   无 CORS 头；疑因 1b0f39b 全市场扫描 657 次突发触发路径级频控——同主机
 *   mkline 路径当晚仍放行，说明封的是路径不是域名）
 * 策略：保留域名隔离初衷（扫描默认仍走 ifzq，burst 不直接打图表源）；主主机失败
 * （网络错误 / 非 200 / WAF 非 JSON）自动落备用主机；会话内记住故障主机
 * （TTL 5 分钟），避免 5254 只票每只都先撞一次 WAF 再切换。
 */
type FqklineHost = 'web.ifzq.gtimg.cn' | 'ifzq.gtimg.cn';

const fqklineUrl = (host: FqklineHost, symbol: string, bars: number) =>
  `https://${host}/appstock/app/fqkline/get?param=${encodeURIComponent(
    symbol
  )},day,,,${bars},qfq`;

/** 会话内已知故障的 fqkline 主机 → 故障时间戳；TTL 内降级走备用主机，过期重试（WAF 封禁非永久） */
const sickHosts = new Map<FqklineHost, number>();
const SICK_TTL_MS = 5 * 60 * 1000;

function hostSick(host: FqklineHost): boolean {
  const at = sickHosts.get(host);
  return at !== undefined && Date.now() - at < SICK_TTL_MS;
}

/** 日K主机链：健康主机在前、故障主机兜底（全故障时按原序再试，TTL 已过的自然复活） */
function fqklineChain(scanHost: boolean): FqklineHost[] {
  const primary: FqklineHost = scanHost ? 'ifzq.gtimg.cn' : 'web.ifzq.gtimg.cn';
  const backup: FqklineHost = scanHost ? 'web.ifzq.gtimg.cn' : 'ifzq.gtimg.cn';
  const healthy = [primary, backup].filter((h) => !hostSick(h));
  const sick = [primary, backup].filter(hostSick);
  return healthy.length > 0 ? [...healthy, ...sick] : [primary, backup];
}

/** 测试专用：清空主机故障记忆（模块级会话状态，跨用例需重置） */
export function resetFqklineHostHealth(): void {
  sickHosts.clear();
}

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

/** fetchDaily 可选参数：bars=日K条数（扫描模式默认 60，图表模式固定 320）；scanHost=true 走扫描专用主机（市场模式） */
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
  if (period !== 'day') {
    // 分钟K维持 mkline@ifzq（web.ifzq 对该路径 301；2026-10-17 实测，当晚仍 200 + CORS）
    const res = await fetchImpl(TX_MKLINE(norm, period));
    if (!res.ok) throw new Error(`K线接口返回 ${res.status}`);
    return parseTencentKline(await readJson(res), period);
  }
  const bars = opts.scanHost ? opts.bars ?? 60 : 320;
  let lastErr: unknown;
  for (const host of fqklineChain(!!opts.scanHost)) {
    try {
      const res = await fetchImpl(fqklineUrl(host, norm, bars));
      if (!res.ok) throw new Error(`K线接口返回 ${res.status}`);
      return parseTencentKline(await readJson(res), period);
    } catch (e) {
      sickHosts.set(host, Date.now()); // 本主机本轮不可用，同会话后续请求直接走备用
      lastErr = e;
    }
  }
  throw lastErr;
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
