// 图表客户端：fetchIntraday / fetchDaily 直连腾讯（fixture 为真实接口返回格式）
import { describe, it, expect } from 'vitest';
import { fetchDaily, fetchIntraday } from '../../lib/chartClient';

function fakeFetch(text: string, seen?: string[]) {
  return async (url: string) => {
    seen?.push(url);
    return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) } as any;
  }
}

const KLINE_JSON = JSON.stringify({
  code: 0,
  data: { sh600000: { qfqday: [['2024-01-02', '11.00', '11.20', '11.30', '10.90', '1000.000']] } }
});

const MINUTE_JSON = JSON.stringify({
  code: 0,
  data: { sh600000: { data: { data: ['0930 11.05 100 5000.00'] } } }
});

describe('fetchIntraday', () => {
  it('解析分时点', async () => {
    const r = await fetchIntraday('sh600000', fakeFetch(MINUTE_JSON));
    expect(r[0]).toEqual({ time: '09:30', price: 11.05 });
  });

  it('用户只输 6 位代码时请求自动补交易所前缀', async () => {
    const seen: string[] = [];
    await fetchIntraday('601929', fakeFetch(MINUTE_JSON, seen));
    expect(seen[0]).toContain('code=sh601929');
  });

  it('非 200 抛错', async () => {
    const f = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' }) as any;
    await expect(fetchIntraday('sh600000', f)).rejects.toThrow();
  });
});

describe('fetchDaily', () => {
  it('解析日K', async () => {
    const r = await fetchDaily('sh600000', 'day', fakeFetch(KLINE_JSON));
    expect(r.length).toBe(1);
    expect(r[0]).toMatchObject({ date: '2024-01-02', open: 11.0, close: 11.2, high: 11.3 });
  });

  it('请求 URL 带周期参数（分钟K走 mkline）', async () => {
    const seen: string[] = [];
    await fetchDaily('601929', 'm30', fakeFetch(KLINE_JSON, seen));
    expect(seen[0]).toContain('sh601929');
    expect(seen[0]).toContain('m30');
    expect(seen[0]).toContain('mkline');
  });

  it('日K走 fqkline（与分钟周期分流）', async () => {
    const seen: string[] = [];
    await fetchDaily('601929', 'day', fakeFetch(KLINE_JSON, seen));
    expect(seen[0]).toContain('fqkline');
    expect(seen[0]).not.toContain('mkline');
  });

  it('非 200 抛错', async () => {
    const f = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' }) as any;
    await expect(fetchDaily('sh600000', 'day', f)).rejects.toThrow();
  });

  it('扫描专用主机 + 条数参数（市场模式，2026-10-18）', async () => {
    const seen: string[] = [];
    await fetchDaily('601929', 'day', fakeFetch(KLINE_JSON, seen), { scanHost: true, bars: 60 });
    expect(seen[0]).toContain('ifzq.gtimg.cn');
    expect(seen[0]).toContain(',day,,,60,qfq');
    expect(seen[0]).not.toContain('web.ifzq');
  });

  it('非 JSON 响应（WAF 挑战页）抛错，避免误判无符合股票', async () => {
    const f = async () => ({ ok: true, status: 200, text: async () => '<html>challenge</html>' }) as any;
    await expect(fetchDaily('sh600000', 'day', f)).rejects.toThrow('非 JSON');
  });
});
