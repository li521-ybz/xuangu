// 模块③ K线 option 守卫：均线组合、成交量、grid 结构（纯 option 断言，无需 canvas）
import { describe, it, expect } from 'vitest';
import { buildOption } from './ChartCanvas';
import type { Candle } from '../../lib/types';

function candles(n: number): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
    open: 10 + (i % 3),
    close: i + 1, // 等差数列 1,2,3,...：MA 期望值可手算
    high: 12 + (i % 3),
    low: 9,
    volume: (i + 1) * 1000
  }));
}

const opt = (period: 'day' | 'm30' | 'm60') =>
  buildOption(candles(30), 'kline', period) as any;

describe('buildOption · 日K', () => {
  it('series 名称集合正确（K线无名 + 4 均线 + 成交量）', () => {
    expect(opt('day').series).toHaveLength(6);
    expect(opt('day').series[0].type).toBe('candlestick');
    const names = opt('day').series.map((s: any) => s.name).filter(Boolean);
    expect(names).toEqual(['MA5', 'MA10', 'MA20', 'MA60', '成交量']);
  });

  it('MA5 第 5 根起为均值，前 4 根 null', () => {
    const ma5 = opt('day').series[1];
    expect(ma5.data[0][1]).toBeNull();
    expect(ma5.data[3][1]).toBeNull();
    expect(ma5.data[4][1]).toBeCloseTo((1 + 2 + 3 + 4 + 5) / 5, 10); // = 3
    expect(ma5.data).toHaveLength(30);
  });

  it('成交量按收/开关系红涨绿跌', () => {
    const vol = opt('day').series[5];
    expect(vol.data[0].itemStyle.color).toBe('#1ba784'); // close 1 < open 10 → 绿
    expect(vol.data[11].itemStyle.color).toBe('#e23c3c'); // close 12 > open 10 → 红
    expect(vol.data[0].value).toBe(1000);
  });

  it('双 grid、双 xAxis、双 yAxis（K线区 + 成交量区）', () => {
    expect(opt('day').grid).toHaveLength(2);
    expect(opt('day').xAxis).toHaveLength(2);
    expect(opt('day').yAxis).toHaveLength(2);
    expect(opt('day').series[1].xAxisIndex).toBe(0);
    expect(opt('day').series[5].xAxisIndex).toBe(1);
  });

  it('均线配色：MA5 红 MA10 绿 MA20 蓝 MA60 黑', () => {
    const colors = opt('day').series.slice(1, 5).map((s: any) => s.lineStyle.color);
    expect(colors).toEqual(['#e23c3c', '#1ba784', '#2f6bff', '#333333']);
  });
});

describe('buildOption · 30分/60分', () => {
  it('含 K线 + MA13/MA25，无成交量，单 grid', () => {
    for (const p of ['m30', 'm60'] as const) {
      const o = opt(p);
      expect(o.series).toHaveLength(3);
      expect(o.series[0].type).toBe('candlestick');
      expect(o.series.map((s: any) => s.name)).toEqual([undefined, 'MA13', 'MA25']);
      expect(o.series.some((s: any) => s.name === '成交量')).toBe(false);
      expect(Array.isArray(o.grid)).toBe(false);
      expect(Array.isArray(o.xAxis)).toBe(false);
    }
  });

  it('MA13 前 12 根 null，第 13 根为均值', () => {
    const ma13 = opt('m30').series[1];
    expect(ma13.data[11][1]).toBeNull();
    expect(ma13.data[12][1]).toBeCloseTo((1 + 13) / 2, 10); // 1..13 均值 = 7
  });

  it('分钟均线配色：MA13 红 MA25 蓝', () => {
    for (const p of ['m30', 'm60'] as const) {
      const colors = opt(p).series.slice(1).map((s: any) => s.lineStyle.color);
      expect(colors).toEqual(['#e23c3c', '#2f6bff']);
    }
  });
});

describe('buildOption · 分时', () => {
  it('仍是单线，不受本次改动影响', () => {
    const o = buildOption([{ time: '09:30', price: 11.05 }], 'intraday') as any;
    expect(o.series).toHaveLength(1);
    expect(o.series[0].type).toBe('line');
  });
});
