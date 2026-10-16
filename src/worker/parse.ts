// 行情/图表数据解析：上游（腾讯，直连免代理）原始文本 -> 领域对象
// 注意：字段位置依据 2026-10-16 真实接口返回校验；接口变更时先用 curl 核对再改这里。
import type { Candle, IntradayPoint, Quote } from '../lib/types';

/** 新浪实时行情：var hq_str_sh600000="名称,今开,昨收,当前,最高,最低,..." */
export function parseSinaLine(line: string): Quote | null {
  const m = line.match(/var\s+hq_str_(\w+)="([^"]*)"/);
  if (!m) return null;
  const symbol = m[1];
  const f = m[2].split(',');
  if (f.length < 4 || f[2] === '' || f[3] === '') return null;
  const name = f[0] || symbol;
  const prevClose = Number(f[2]);
  const price = Number(f[3]);
  if (!isFinite(prevClose) || !isFinite(price)) return null;
  const change = price - prevClose;
  const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;
  return { symbol, name, price, prevClose, change, changePct, time: f[30] || undefined };
}

/**
 * 腾讯实时行情：v_sh600000="1~名称~代码~当前价~昨收~今开~成交量(手)~成交额(万)~...~时间~涨跌额~涨跌幅%~最高~最低~..."
 * 字段位次经 2026-10-16 真实返回校验：[3]=当前价、[4]=昨收、[5]=今开、[30]=时间、[31]=涨跌额、[32]=涨跌幅%；
 * 涨跌额/涨跌幅优先采用腾讯自带字段（分母即昨收，与行情软件一致）。
 */
export function parseTencentLine(line: string): Quote | null {
  const m = line.match(/v_(\w+)="([^"]*)"/);
  if (!m) return null;
  const symbol = m[1];
  const f = m[2].split('~');
  if (f.length < 6 || f[3] === '' || f[4] === '') return null;
  const name = f[1] || symbol;
  const price = Number(f[3]);
  const prevClose = Number(f[4]);
  if (!isFinite(prevClose) || !isFinite(price)) return null;
  const change = numOr(f[31], price - prevClose);
  const changePct = numOr(f[32], prevClose !== 0 ? (change / prevClose) * 100 : 0);
  return { symbol, name, price, prevClose, change, changePct, time: f[30] || undefined };
}

/** 取字段数值，空值/非法时回退 */
function numOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return isFinite(n) ? n : fallback;
}

/** 批量解析（支持多行原始文本，自动识别新浪/腾讯） */
export function parseQuotesBatch(raw: string): Quote[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('var hq_str_') ? parseSinaLine(l) : parseTencentLine(l)))
    .filter((q): q is Quote => q !== null);
}

/**
 * 腾讯 K 线（fqkline/get）：{"code":0,"data":{"sh601929":{"qfqday":[[日期,开,收,高,低,量],...]}}}
 * 注意字段序是「日期,开,收,高,低,量」——第三位是收盘、第四位是最高（与新浪相反）。
 * key 名：day/week/month 或 qfq 前缀（前复权）；period 为 day|week|month。
 */
export function parseTencentKline(
  jsonText: string,
  period: 'day' | 'week' | 'month' = 'day'
): Candle[] {
  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const data = (obj as { data?: Record<string, Record<string, unknown>> })?.data;
  if (!data) return [];
  const out: Candle[] = [];
  for (const sym of Object.keys(data)) {
    const keys = data[sym];
    const rows = (keys[`qfq${period}`] ?? keys[period]) as unknown;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const candle: Candle = {
        date: String(row[0]),
        open: Number(row[1]),
        close: Number(row[2]),
        high: Number(row[3]),
        low: Number(row[4]),
        volume: Number(row[5])
      };
      if ([candle.open, candle.high, candle.low, candle.close].every(isFinite)) {
        out.push(candle);
      }
    }
  }
  // K 线按时间正序（接口返回正序；防御性排序保证）
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 腾讯分时（minute/query）：{"code":0,"data":{"sh601929":{"data":{"data":["0930 2.56 20509 5250304.00",...]}}}}
 * 每条：HHmm 价格 成交量(手) 成交额；time 输出 HH:MM。
 */
export function parseTencentMinute(jsonText: string): IntradayPoint[] {
  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const data = (obj as { data?: Record<string, { data?: { data?: unknown } }> })?.data;
  if (!data) return [];
  const out: IntradayPoint[] = [];
  for (const sym of Object.keys(data)) {
    const rows = data[sym]?.data?.data;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (typeof row !== 'string') continue;
      const f = row.trim().split(/\s+/);
      if (f.length < 2 || f[0].length < 4) continue;
      const price = Number(f[1]);
      if (!isFinite(price)) continue;
      out.push({ time: `${f[0].slice(0, 2)}:${f[0].slice(2, 4)}`, price });
    }
  }
  return out;
}
