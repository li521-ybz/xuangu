// 图表客户端：fetchIntraday / fetchDaily 经 CORS 代理拉新浪 JSON 并解析
import { describe, it, expect } from 'vitest';
import { fetchDaily, fetchIntraday } from '../../lib/chartClient';

function fakeFetch(text: string) {
  return async () => ({ ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) }) as any;
}

describe('fetchIntraday', () => {
  it('解析分时点', async () => {
    const json = JSON.stringify([
      ['2024-01-02 09:30', '11.05', '11.03', 100],
      ['2024-01-02 09:31', '11.06', '11.04', 120]
    ]);
    const r = await fetchIntraday('sh600000', fakeFetch(json));
    expect(r[0]).toEqual({ time: '09:30', price: 11.05 });
    expect(r[1].time).toBe('09:31');
  });

  it('非 200 抛错', async () => {
    const f = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' }) as any;
    await expect(fetchIntraday('sh600000', f)).rejects.toThrow();
  });
});

describe('fetchDaily', () => {
  it('解析日K', async () => {
    const json = JSON.stringify([
      ['2024-01-02', '11.00', '11.20', '10.90', '11.10', 1000],
      ['2024-01-03', '11.10', '11.30', '11.00', '11.20', 1200]
    ]);
    const r = await fetchDaily('sh600000', fakeFetch(json));
    expect(r.length).toBe(2);
    expect(r[0]).toMatchObject({ date: '2024-01-02', open: 11.0, close: 11.1 });
    expect(r[1].volume).toBe(1200);
  });

  it('非 200 抛错', async () => {
    const f = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' }) as any;
    await expect(fetchDaily('sh600000', f)).rejects.toThrow();
  });
});
