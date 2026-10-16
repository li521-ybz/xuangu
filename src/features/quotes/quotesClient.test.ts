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
    // 真实字段序（2026-10-16 实测）：1~名称~代码~当前价~昨收~今开~...
    const line = 'v_sh600000="1~PUFA~600000~11.05~11.20~11.30~11.00~10.90~11.20"';
    const r = await fetchQuotes(['sh600000'], fakeFetch(line));
    expect(r.quotes[0].symbol).toBe('sh600000');
    expect(r.quotes[0].name).toBe('PUFA');
    expect(r.quotes[0].price).toBeCloseTo(11.05);
    expect(r.quotes[0].prevClose).toBeCloseTo(11.2); // f[4] 昨收
  });

  it('用户只输 6 位代码时请求自动补交易所前缀', async () => {
    // 601929 是上交所股票，腾讯接口只认 sh601929——必须补前缀否则「暂无数据」
    const seen: string[] = [];
    const line = 'v_sh601929="1~JISHI~601929~2.48~2.53~2.56~3101671~1506194"';
    const r = await fetchQuotes(['601929'], fakeFetch(line, seen));
    expect(seen[0]).toContain('qt.gtimg.cn/q=sh601929'); // 直连腾讯，无代理包装
    expect(r.quotes[0].symbol).toBe('sh601929');
    expect(r.quotes[0].prevClose).toBeCloseTo(2.53);
    expect(r.degraded).toBe(false);
  });

  it('部分解析失败标记 degraded', async () => {
    const line = 'v_sh600000="1~PUFA~600000~11.05~11.20~11.30~11.00~10.90~11.20"';
    const r = await fetchQuotes(['sh600000', 'sh600001'], fakeFetch(line));
    expect(r.quotes.length).toBe(1);
    expect(r.degraded).toBe(true);
  });

  it('非 200 抛错', async () => {
    const f = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }) as any;
    await expect(fetchQuotes(['sh600000'], f)).rejects.toThrow();
  });
});
