// 全市场统计：模块① 看盘总览的数据层
//
// 双路取数（沿用 marketList.ts 的既有结论，2026-10-21 复测）：
//   主源 东财 clist 一 shot：一次拿全 5500+ 只，字段含成交额/换手率/主力净流入，最省请求；
//        但东财域名在部分网络（本机代理墙）不可达，必须能降级。
//   兜底 腾讯批量行情：复用 marketList 的名单（含按天缓存），再 400 只/批并发拉报价；
//        腾讯缺「主力净流入」，该指标降级为 undefined，界面显示「—」。
// 口径：沪深主板 + 创业板 + 科创板，不含北交所（与选股模块一致，用户 2026-10-18 拍板）。
import type { MarketRow, MarketSnapshot, Breadth } from './types';
import { parseTencentMarketBatch } from '../worker/parse';
import { readGbk } from './quotesClient';
import { safeFetch } from './fetchSafe';
import { fetchMarketRoster } from './marketList';
import { mapLimit } from './mapLimit';

/** 东财板块码：深主板 + 沪主板 + 科创板 + 创业板（逗号分隔，2026-10-18 实测） */
const EM_FS = 'm:0+t:6,m:1+t:2,m:1+t:23,m:0+t:80';
/** 东财字段：f12 代码 f14 名称 f2 最新价 f3 涨跌幅 f6 成交额(元) f8 换手率 f62 主力净流入(元) */
const EM_FIELDS = 'f12,f14,f2,f3,f6,f8,f62';

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}

/** 涨跌幅上限推断：ST 5%、科创/创业 20%、主板 10%（北交所不在名单内） */
export function inferLimitPct(code: string, name: string): number {
  if (/ST/i.test(name)) return 5;
  if (/^(688|689|300|301)/.test(code)) return 20;
  return 10;
}

/** 东财 diff 既可能是数组也可能是对象（{0:{},1:{}}），统一成数组 */
function diffRows(diff: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(diff)) return diff as Array<Record<string, unknown>>;
  if (diff && typeof diff === 'object') return Object.values(diff) as Array<Record<string, unknown>>;
  return [];
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** 东财一 shot；拿不全或非 JSON 一律返回 null，由调用方落兜底 */
async function fetchEastmoneyRows(
  fetchImpl: typeof fetch,
  onProgress?: (msg: string) => void
): Promise<MarketRow[] | null> {
  onProgress?.('正在拉取东财全市场快照…');
  const url =
    'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=6000&po=1&np=1&fltt=2&invt=2&fid=f12' +
    `&fs=${EM_FS}&fields=${EM_FIELDS}`;
  const res = await fetchImpl(url, { signal: timeoutSignal(15000) });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.trimStart().startsWith('{')) return null; // WAF / 错误页
  const obj = JSON.parse(text) as { data?: { total?: number; diff?: unknown } };
  const rows = diffRows(obj?.data?.diff);
  if (rows.length < 4000) return null; // 拿不全宁可降级，不用残缺数据算涨跌家数

  const out: MarketRow[] = [];
  for (const r of rows) {
    const code = String(r.f12 ?? '');
    const name = String(r.f14 ?? '');
    const price = num(r.f2);
    const pct = num(r.f3);
    if (!code || !name || !Number.isFinite(price) || !Number.isFinite(pct)) continue;
    const limitPct = inferLimitPct(code, name);
    const inflow = num(r.f62);
    out.push({
      symbol: `${code.startsWith('6') ? 'sh' : 'sz'}${code}`,
      code,
      name,
      price,
      prevClose: pct !== -100 ? price / (1 + pct / 100) : price,
      changePct: pct,
      amount: num(r.f6) || 0,
      turnover: Number.isFinite(num(r.f8)) ? num(r.f8) : undefined,
      mainInflow: Number.isFinite(inflow) ? inflow : undefined,
      limitPct
    });
  }
  return out.length >= 4000 ? out : null;
}

/** 腾讯兜底：名单（按天缓存）+ 批量报价 */
async function fetchTencentRows(
  fetchImpl: typeof fetch,
  onProgress?: (msg: string) => void
): Promise<MarketRow[]> {
  onProgress?.('东财不可达，改用腾讯批量行情（首次约 10–30 秒）…');
  const roster = await fetchMarketRoster(fetchImpl);
  const symbols = roster.stocks.map((s) => s.symbol);
  if (symbols.length === 0) return [];

  const CHUNK = 400;
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += CHUNK) batches.push(symbols.slice(i, i + CHUNK));

  let done = 0;
  const texts = await mapLimit(batches, 6, async (batch) => {
    try {
      const res = await fetchImpl(`https://qt.gtimg.cn/q=${encodeURIComponent(batch.join(','))}`, {
        signal: timeoutSignal(20000)
      });
      if (!res.ok) return '';
      return await readGbk(res);
    } catch {
      return '';
    } finally {
      done += 1;
      onProgress?.(`正在拉取腾讯行情 ${done}/${batches.length} 批…`);
    }
  });

  const out: MarketRow[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const r of parseTencentMarketBatch(text)) {
      out.push({
        symbol: r.symbol,
        code: r.code,
        name: r.name,
        price: r.price,
        prevClose: r.prevClose,
        changePct: r.changePct,
        amount: r.amount,
        turnover: Number.isFinite(r.turnover) ? r.turnover : undefined,
        limitPct: inferLimitPct(r.code, r.name)
      });
    }
  }
  return out;
}

/** 拉取全市场快照：东财优先、腾讯兜底；两条都失败抛错 */
export async function fetchMarketSnapshot(
  fetchImpl: typeof fetch = safeFetch,
  onProgress?: (msg: string) => void
): Promise<MarketSnapshot> {
  let source: MarketSnapshot['source'] = 'eastmoney';
  let rows: MarketRow[] | null = null;
  try {
    rows = await fetchEastmoneyRows(fetchImpl, onProgress);
  } catch {
    rows = null;
  }
  if (!rows || rows.length === 0) {
    source = 'tencent';
    rows = await fetchTencentRows(fetchImpl, onProgress);
  }
  if (rows.length === 0) throw new Error('行情源暂不可用，请稍后重试');
  return { source, rows, fetchedAt: Date.now() };
}

/** 市场宽度统计：涨跌家数 / 涨跌停 / 总成交额 / 主力净流入 */
export function computeBreadth(rows: MarketRow[]): Breadth {
  let up = 0;
  let down = 0;
  let flat = 0;
  let limitUp = 0;
  let limitDown = 0;
  let amount = 0;
  let mainInflow = 0;
  let hasInflow = false;

  for (const r of rows) {
    if (r.changePct > 0) up += 1;
    else if (r.changePct < 0) down += 1;
    else flat += 1;

    // 涨停/跌停：涨跌幅贴近板幅（留 0.2pct 容差，避免 9.98 因四舍五入漏判）
    if (r.changePct >= r.limitPct - 0.2) limitUp += 1;
    if (r.changePct <= -(r.limitPct - 0.2)) limitDown += 1;

    amount += r.amount;
    if (typeof r.mainInflow === 'number') {
      mainInflow += r.mainInflow;
      hasInflow = true;
    }
  }

  return {
    up,
    down,
    flat,
    limitUp,
    limitDown,
    amount,
    mainInflow: hasInflow ? mainInflow : undefined,
    total: rows.length
  };
}

export type RankKind = 'gain' | 'loss' | 'amount' | 'turnover' | 'inflow';

export const RANK_LABELS: Record<RankKind, string> = {
  gain: '涨幅榜',
  loss: '跌幅榜',
  amount: '成交额榜',
  turnover: '换手率榜',
  inflow: '主力净流入'
};

/** 排行榜：按指定口径取前 n（已排除停牌/无价格行） */
export function topRanked(rows: MarketRow[], kind: RankKind, n = 15): MarketRow[] {
  const pool = rows.filter((r) => Number.isFinite(r.changePct));
  const sorted = [...pool];
  switch (kind) {
    case 'gain':
      sorted.sort((a, b) => b.changePct - a.changePct);
      break;
    case 'loss':
      sorted.sort((a, b) => a.changePct - b.changePct);
      break;
    case 'amount':
      sorted.sort((a, b) => b.amount - a.amount);
      break;
    case 'turnover':
      sorted.sort((a, b) => (b.turnover ?? -1) - (a.turnover ?? -1));
      break;
    case 'inflow':
      sorted.sort((a, b) => (b.mainInflow ?? -Infinity) - (a.mainInflow ?? -Infinity));
      break;
  }
  return sorted.slice(0, n);
}
