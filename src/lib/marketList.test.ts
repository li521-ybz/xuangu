// 沪深A股名单测试：东财一shot 主源（f2 过滤退市/拿不全弃用）→ 腾讯枚举兜底；缓存读写
// fixture 均为真实接口形态（2026-10-18 实测）：东财 diff 项 {f12,f14,f2}；腾讯行为 v_代码="1~名称~代码~价~昨收~..."
import { describe, it, expect, beforeEach } from 'vitest';
import {
  fetchMarketRoster,
  loadCachedRoster,
  saveCachedRoster,
  todayStr
} from './marketList';
import type { Stock } from './types';

type FakeRes = { ok: boolean; status: number; text: () => Promise<string>; arrayBuffer: () => Promise<ArrayBuffer> };

function res(text: string, ok = true): FakeRes {
  return {
    ok,
    status: ok ? 200 : 500,
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text)
  };
}

/** 东财 diff 一项 */
function emItem(code: string, name: string, price: number | string) {
  return { f12: code, f14: name, f2: price };
}

/** 东财一shot 响应（total 可大于 diff.length 模拟「服务端拿不全」） */
function emJson(diff: unknown[], total = diff.length): string {
  return JSON.stringify({ rc: 0, data: { total, diff } });
}

/** 腾讯批量行情一行（价/昨收为字段 [3]/[4]） */
function txLine(symbol: string, name: string, price: string): string {
  return `v_${symbol}="1~${name}~${symbol.slice(2)}~${price}~9.64~9.60~100~200~300~9.72~25~9.71~1076~~~20261019140000~0.09~0.93~9.79~9.53"`;
}

/** 生成 N 只不同代码的腾讯行情文本（ASCII 名称，GBK/UTF-8 解码皆可） */
function txText(n: number, prefix = 'sh', from = 600000): string {
  return Array.from(
    { length: n },
    (_, i) => txLine(`${prefix}${from + i}`, `NAME${i}`, (10 + (i % 50) / 10).toFixed(2))
  ).join('\n');
}

/** 按 URL 路由的假 fetch：handlers 按序匹配，failTimes 内返回 500 */
function router(
  handlers: Array<{ test: string; text?: string | ((url: string, call: number) => string); failTimes?: number }>
) {
  const calls = new Map<string, number>();
  const fn = async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const h of handlers) {
      if (!url.includes(h.test)) continue;
      const n = (calls.get(url) ?? 0) + 1;
      calls.set(url, n);
      if (h.failTimes && n <= h.failTimes) return res('', false);
      const text = typeof h.text === 'function' ? h.text(url, n) : (h.text ?? '');
      return res(text);
    }
    throw new Error(`unexpected url: ${url}`);
  };
  return fn as unknown as typeof fetch;
}

const EM = 'push2.eastmoney.com';
const TX = 'qt.gtimg.cn';

describe('fetchMarketRoster：东财一shot 主源', () => {
  it('正常返回：按代码补交易所前缀、f2="-" 退市票源头过滤', async () => {
    const diff = [
      emItem('600000', '浦发银行', 9.73),
      emItem('000001', '平安银行', 11.2),
      emItem('300002', '神州泰岳', 8.5),
      emItem('688000', '瑞可达', 44.5), // 科创板
      emItem('600001', '邯郸钢铁', '-') // 已退市：f2 为 "-"
    ];
    // 补足 4000 下限（真实场景 5562 只，测试只验逻辑）
    for (let i = 0; i < 3996; i++) diff.push(emItem(String(601000 + i), `股票${i}`, 10 + (i % 30)));
    const r = await fetchMarketRoster(router([{ test: EM, text: emJson(diff) }]));
    expect(r.source).toBe('eastmoney');
    expect(r.date).toBe(todayStr());
    expect(r.stocks).toHaveLength(4000); // 5 - 1 退市 + 3996
    expect(r.stocks[0]).toEqual({ id: 'sh600000', symbol: 'sh600000', name: '浦发银行', group: '沪深A股' });
    expect(r.stocks[1].symbol).toBe('sz000001');
    expect(r.stocks[2].symbol).toBe('sz300002');
    expect(r.stocks[3].symbol).toBe('sh688000');
    expect(r.stocks.some((s) => s.symbol === 'sh600001')).toBe(false);
  });

  it('一shot 没拿全（diff 少于 total）→ 弃用东财落腾讯枚举', async () => {
    const r = await fetchMarketRoster(
      router([
        { test: EM, text: emJson([emItem('600000', '浦发银行', 9.73)], 5562) },
        { test: TX, text: txText(4001) }
      ])
    );
    expect(r.source).toBe('tencent');
    expect(r.stocks).toHaveLength(4001);
  });

  it('东财返回非 JSON（WAF 挑战页）→ 落腾讯枚举', async () => {
    const r = await fetchMarketRoster(
      router([
        { test: EM, text: '<html>waf challenge</html>' },
        { test: TX, text: txText(4001) }
      ])
    );
    expect(r.source).toBe('tencent');
  });

  it('东财 HTTP 失败 → 落腾讯枚举', async () => {
    const r = await fetchMarketRoster(
      router([
        { test: EM, text: '', failTimes: 99 },
        { test: TX, text: txText(4001) }
      ])
    );
    expect(r.source).toBe('tencent');
  });
});

describe('fetchMarketRoster：腾讯枚举兜底', () => {
  it('解析有效报价行；无报价/空字段行被跳过；按代码去重', async () => {
    const text = [
      txLine('sh600000', '浦发银行', '9.73'),
      txLine('sz000001', '平安银行', '11.20'),
      txLine('sz300002', '神州泰岳', '0.00'), // 零报价：跳过
      'v_sh600003=""', // 空行：解析为 null
      ...txText(3998, 'sh', 601000).split('\n')
    ].join('\n');
    const r = await fetchMarketRoster(router([{ test: TX, text }]));
    expect(r.source).toBe('tencent');
    expect(r.stocks).toHaveLength(4000); // 2 有效 + 3998
    expect(r.stocks.map((s) => s.symbol)).toContain('sz000001');
  });

  it('单批失败重试一次即成功', async () => {
    const r = await fetchMarketRoster(
      router([{ test: TX, text: txText(4001), failTimes: 1 }]) // 每批第一次 500，第二次成功
    );
    expect(r.stocks).toHaveLength(4001);
  });

  it('批量持续失败 → 抛错（面板显示重试）', async () => {
    await expect(
      fetchMarketRoster(router([{ test: TX, text: '', failTimes: 99 }]))
    ).rejects.toThrow();
  });

  it('有效票异常偏少 → 抛错（防解析bug静默产出小名单）', async () => {
    await expect(fetchMarketRoster(router([{ test: TX, text: txText(10) }]))).rejects.toThrow(
      /异常偏少/
    );
  });
});

describe('名单缓存', () => {
  const stocks: Stock[] = [
    { id: 'sh600000', symbol: 'sh600000', name: '浦发银行', group: '沪深A股' }
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it('写入后读回一致', () => {
    saveCachedRoster({ date: '2026-10-18', source: 'eastmoney', stocks });
    const r = loadCachedRoster();
    expect(r?.date).toBe('2026-10-18');
    expect(r?.stocks).toHaveLength(1);
  });

  it('损坏 JSON → null', () => {
    localStorage.setItem('xuangu.market-roster.v1', '{not json');
    expect(loadCachedRoster()).toBeNull();
  });

  it('结构不符（空名单）→ null', () => {
    localStorage.setItem('xuangu.market-roster.v1', JSON.stringify({ date: '2026-10-18', stocks: [] }));
    expect(loadCachedRoster()).toBeNull();
  });
});
