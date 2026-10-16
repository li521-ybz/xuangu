// 行情客户端：fetchQuotes 经 CORS 代理拉腾讯原始文本并解析（GBK 解码）
import { describe, it, expect } from 'vitest';
import { fetchQuotes } from '../../lib/quotesClient';

function fakeFetch(text: string, seen?: string[]) {
  const buf = new TextEncoder().encode(text).buffer;
  return async (url: string) => {
    seen?.push(url);
    return { ok: true, status: 200, arrayBuffer: async () => buf, text: async () => text, json: async () => JSON.parse(text) } as any;
  };
}

describe('fetchQuotes', () => {
  it('空列表直接返回空', async () => {
    const r = await fetchQuotes([], fakeFetch(''));
    expect(r.quotes).toEqual([]);
  });

  it('解析腾讯原始行为 Quote[]', async () => {
    // 腾讯格式 v_代码="代码~名称~今开~当前~昨收~..."（解析器取 f[1] 为名称；此处用 ASCII 避免多字节）
    const line = 'v_sh600000="600000~PUFA~11.20~11.05~11.00~11.30~10.90~11.20"';
    const r = await fetchQuotes(['sh600000'], fakeFetch(line));
    expect(r.quotes[0].symbol).toBe('sh600000');
    expect(r.quotes[0].name).toBe('PUFA');
    expect(r.quotes[0].price).toBeCloseTo(11.05);
    expect(r.quotes[0].prevClose).toBeCloseTo(11.3);
  });

  it('用户只输 6 位代码时请求自动补交易所前缀', async () => {
    // 601929 是上交所股票，腾讯接口只认 sh601929——必须补前缀否则「暂无数据」
    const seen: string[] = [];
    const line = 'v_sh601929="601929~JISHI~11.20~11.05~11.00~11.30~10.90~11.20"';
    const r = await fetchQuotes(['601929'], fakeFetch(line, seen));
    expect(seen[0]).toContain('q%3Dsh601929'); // 经 CORS 代理包装，"=" 被编码为 %3D
    expect(r.quotes[0].symbol).toBe('sh601929');
    expect(r.degraded).toBe(false);
  });

  it('部分解析失败标记 degraded', async () => {
    const line = 'v_sh600000="PUFA~sh600000~11.20~11.05~11.00~11.30~10.90~11.20"';
    const r = await fetchQuotes(['sh600000', 'sh600001'], fakeFetch(line));
    expect(r.quotes.length).toBe(1);
    expect(r.degraded).toBe(true);
  });

  it('非 200 抛错', async () => {
    const f = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }) as any;
    await expect(fetchQuotes(['sh600000'], f)).rejects.toThrow();
  });
});
