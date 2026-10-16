// 行情客户端：模块② 浏览器经公共 CORS 代理直连腾讯行情（替代 Cloudflare Workers /api/quotes）
import type { Quote } from './types';
import { parseQuotesBatch } from '../worker/parse';
import { corsProxyUrl } from './proxyUrl';

export interface QuotesResponse {
  quotes: Quote[];
  degraded?: boolean; // 部分股票因上游失败而降级（解析为空）
}

/** 上游返回 GBK，浏览器需按 GBK 解码（ASCII 安全；失败降级 UTF-8） */
async function readGbk(res: Response): Promise<string> {
  const buf = await res.arrayBuffer();
  try {
    return new TextDecoder('gbk').decode(buf);
  } catch {
    return new TextDecoder().decode(buf);
  }
}

export async function fetchQuotes(
  symbols: string[],
  fetchImpl: typeof fetch = fetch
): Promise<QuotesResponse> {
  if (symbols.length === 0) return { quotes: [] };
  const target = `https://qt.gtimg.cn/q=${encodeURIComponent(symbols.join(','))}`;
  const res = await fetchImpl(corsProxyUrl(target));
  if (!res.ok) throw new Error(`行情代理返回 ${res.status}`);
  const text = await readGbk(res);
  const quotes = parseQuotesBatch(text);
  return { quotes, degraded: quotes.length < symbols.length };
}
