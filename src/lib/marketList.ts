// 沪深A股名单（条件选股「市场模式」的扫描范围，2026-10-18 上线）
// 口径（用户 2026-10-18 拍板）：沪主板 + 科创板 + 深主板 + 创业板，**不含北交所**。
//
// 双路降级（本机网络实测定稿，2026-10-18）：
//   主源 东财 clist 一shot：fs 四板块逗号分隔共 5562 只，pz=10000 一次拿全（无需分页）；
//        fields 带 f2（最新价），已退市票 f2="-" → 源头过滤，名单干净。
//        注意：东财域名在部分网络/CORS 环境不可达（本机代理墙即不通），失败自动落兜底。
//   兜底 腾讯代码空间枚举：qt.gtimg.cn 批量行情（本 APP 生产已证域名），15000 个代码 30 批×500，
//        实测 13.1s/0 失败/5571 只；会带入少量早已退市老票（价格是最后停板价，
//        行情时间字段对死票也显示今天，名单层无法识别），由扫描时「日K新鲜度」检查滤掉。
// 名单按日缓存 localStorage，当天再次进入零请求。
import type { Stock } from './types';
import { parseQuotesBatch } from '../worker/parse';
import { readGbk } from './quotesClient';
import { safeFetch } from './fetchSafe';
import { normalizeSymbol } from './symbol';
import { mapLimit } from './mapLimit';

/** 市场模式股票的分组名（仅用于 ScreenRow.stock，不进自选股仓库） */
export const MARKET_GROUP = '沪深A股';

/** 名单缓存键：按天失效，结构升级改版本号 */
const CACHE_KEY = 'xuangu.market-roster.v1';

export type RosterSource = 'eastmoney' | 'tencent';

export interface MarketRoster {
  date: string; // 本地日期 YYYY-MM-DD（拉取日）
  source: RosterSource;
  stocks: Stock[];
}

/** 东财 clist 板块码：深主板 m:0+t:6 + 沪主板 m:1+t:2 + 科创板 m:1+t:23 + 创业板 m:0+t:80。
 *  分隔符必须是逗号（2026-10-18 实测：用 + 只生效最后一个板块，返回 1453；逗号返回 5562） */
const EM_FS = 'm:0+t:6,m:1+t:2,m:1+t:23,m:0+t:80';

/** 腾讯枚举代码空间：沪主板 600000-605999 / 科创板 688000-689999 / 深主板 000001-004999 / 创业板 300000-301999 */
const TX_RANGES: Array<[prefix: string, from: number, to: number]> = [
  ['sh', 600000, 605999],
  ['sh', 688000, 689999],
  ['sz', 1, 4999],
  ['sz', 300000, 301999]
];

/** 本地当天日期 YYYY-MM-DD */
export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 请求超时信号；老环境（无 AbortSignal.timeout，如部分 jsdom）退化为不限时 */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}

/** 拉取沪深A股名单：东财一shot 主源，任何失败/不全自动落腾讯枚举兜底 */
export async function fetchMarketRoster(fetchImpl: typeof fetch = safeFetch): Promise<MarketRoster> {
  try {
    const em = await fetchEastmoneyRoster(fetchImpl);
    if (em) return em;
  } catch {
    // 东财不可达（CORS/网络/非 JSON/拿不全）→ 走腾讯枚举，功能不瘫
  }
  return fetchTencentRoster(fetchImpl);
}

/** 东财 clist 一shot；返回 null = 弃用该源（调用方落兜底） */
async function fetchEastmoneyRoster(fetchImpl: typeof fetch): Promise<MarketRoster | null> {
  const url =
    'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10000&po=1&np=1&fltt=2&invt=2&fid=f12' +
    `&fs=${EM_FS}&fields=f12,f14,f2`;
  const res = await fetchImpl(url, { signal: timeoutSignal(15000) });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.trimStart().startsWith('{')) return null; // WAF/错误页
  const obj = JSON.parse(text) as {
    data?: { total?: number; diff?: Array<{ f12?: string; f14?: string; f2?: number | string }> };
  };
  const diff = obj?.data?.diff;
  if (!Array.isArray(diff)) return null;
  // 防御：一shot 没拿全（服务端若封顶 pz，宁可弃用走兜底，不可缺票）
  const total = obj.data?.total;
  if (typeof total === 'number' && diff.length < total) return null;
  if (diff.length < 4000) return null;

  const seen = new Set<string>();
  const stocks: Stock[] = [];
  for (const it of diff) {
    const code = (it.f12 ?? '').trim();
    const name = (it.f14 ?? '').trim();
    if (!/^\d{6}$/.test(code)) continue;
    if (!(Number(it.f2) > 0)) continue; // 退市/无报价票源头过滤（f2="-"）
    const symbol = normalizeSymbol(code);
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    stocks.push({ id: symbol, symbol, name: name || symbol, group: MARKET_GROUP });
  }
  if (stocks.length < 4000) return null;
  return { date: todayStr(), source: 'eastmoney', stocks };
}

/** 腾讯代码空间枚举兜底：15000 个代码分 30 批拉批量行情，解析出有效报价的即为在场股票 */
async function fetchTencentRoster(fetchImpl: typeof fetch): Promise<MarketRoster> {
  const codes: string[] = [];
  for (const [prefix, from, to] of TX_RANGES) {
    for (let n = from; n <= to; n++) codes.push(`${prefix}${String(n).padStart(6, '0')}`);
  }
  const chunks: string[][] = [];
  for (let i = 0; i < codes.length; i += 500) chunks.push(codes.slice(i, i + 500));

  const texts = await mapLimit(chunks, 4, async (chunk, idx) => {
    const url = `https://qt.gtimg.cn/q=${chunk.join(',')}`;
    // 单批失败重试一次（30 批里偶发一批网络抖动，不值得让整份名单重来）
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchImpl(url, { signal: timeoutSignal(20000) });
        if (!res.ok) throw new Error(`枚举第 ${idx + 1} 批返回 ${res.status}`);
        return await readGbk(res);
      } catch (e) {
        if (attempt >= 1) throw e;
      }
    }
  });

  const seen = new Map<string, Stock>();
  for (const text of texts) {
    for (const q of parseQuotesBatch(text)) {
      if (!(q.price > 0) || !(q.prevClose > 0) || !q.name) continue;
      const symbol = normalizeSymbol(q.symbol);
      if (!seen.has(symbol)) seen.set(symbol, { id: symbol, symbol, name: q.name, group: MARKET_GROUP });
    }
  }
  if (seen.size < 4000) throw new Error('腾讯枚举结果异常偏少，请稍后重试');
  return { date: todayStr(), source: 'tencent', stocks: [...seen.values()] };
}

/** 读缓存名单（无缓存/损坏/结构不符返回 null；node 无 localStorage 时安全） */
export function loadCachedRoster(): MarketRoster | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as MarketRoster | null;
    if (!obj || typeof obj.date !== 'string' || !Array.isArray(obj.stocks) || obj.stocks.length === 0) {
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

/** 写缓存（超额/禁用时静默放弃，不影响功能） */
export function saveCachedRoster(roster: MarketRoster): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CACHE_KEY, JSON.stringify(roster));
  } catch {
    // 配额满等：放弃缓存，下次重新拉
  }
}
