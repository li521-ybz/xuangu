// 行情/图表数据解析：Workers 代理使用（上游免费接口原始文本 -> 领域对象）
// 注意：字段位置依据公开文档；集成阶段用真实接口返回校验一次即可。
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

/** 腾讯实时行情：v_sh600000="名称~代码~当前~今开~昨收~..."（~ 分隔） */
export function parseTencentLine(line: string): Quote | null {
  const m = line.match(/v_(\w+)="([^"]*)"/);
  if (!m) return null;
  const symbol = m[1];
  const f = m[2].split('~');
  if (f.length < 6 || f[3] === '' || f[5] === '') return null;
  const name = f[1] || symbol;
  const price = Number(f[3]);
  const prevClose = Number(f[5]);
  if (!isFinite(prevClose) || !isFinite(price)) return null;
  const change = price - prevClose;
  const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;
  return { symbol, name, price, prevClose, change, changePct, time: f[30] || undefined };
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

/** 新浪日 K：每行 date,open,high,low,close,volume */
export function parseSinaDaily(text: string): Candle[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(','))
    .filter((p) => p.length >= 6 && p[0])
    .map((p) => ({
      date: p[0],
      open: Number(p[1]),
      high: Number(p[2]),
      low: Number(p[3]),
      close: Number(p[4]),
      volume: Number(p[5])
    }))
    .filter((c) => [c.open, c.high, c.low, c.close].every(isFinite));
}

/** 新浪日 K（JSON）：getKLineData 返回 [[ "YYYY-MM-DD", open, high, low, close, volume ], ...] */
export function parseSinaDailyJson(text: string): Candle[] {
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row) => (Array.isArray(row) ? (row as unknown[]) : null))
    .filter((r): r is unknown[] => r !== null && r.length >= 6)
    .map((r) => ({
      date: String(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5])
    }))
    .filter((c) => [c.open, c.high, c.low, c.close].every(isFinite));
}

/** 新浪分时：JSON 数组 [[ "YYYY-MM-DD HH:MM", price, avg, volume ], ...] */
export function parseSinaIntraday(jsonText: string): IntradayPoint[] {
  let arr: unknown;
  try {
    arr = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row) => (Array.isArray(row) ? (row as unknown[]) : null))
    .filter((r): r is unknown[] => r !== null && r.length >= 2)
    .map((r) => {
      const ts = String(r[0]);
      const price = Number(r[1]);
      const hhmm = ts.includes(' ') ? ts.split(' ')[1] : ts;
      return { time: hhmm, price };
    })
    .filter((p) => isFinite(p.price));
}
