// 阶段3 解析：新浪日K / 分时 -> 领域对象
import { describe, it, expect } from 'vitest';
import { parseSinaDaily, parseSinaIntraday } from '../../worker/parse';

describe('parseSinaDaily', () => {
  it('解析多根日K', () => {
    const text = [
      '2024-01-02,11.00,11.20,10.90,11.10,1000',
      '2024-01-03,11.10,11.30,11.00,11.20,1200'
    ].join('\n');
    const candles = parseSinaDaily(text);
    expect(candles.length).toBe(2);
    expect(candles[0]).toMatchObject({ date: '2024-01-02', open: 11.0, high: 11.2, low: 10.9, close: 11.1 });
    expect(candles[1].volume).toBe(1200);
  });

  it('脏数据过滤', () => {
    const text = 'bad-line\n2024-01-02,11.00,11.20,10.90,11.10,1000';
    const candles = parseSinaDaily(text);
    expect(candles.length).toBe(1);
  });
});

describe('parseSinaIntraday', () => {
  it('解析分时点（取 HH:MM）', () => {
    const json = JSON.stringify([
      ['2024-01-02 09:30', '11.05', '11.03', 100],
      ['2024-01-02 09:31', '11.06', '11.04', 120]
    ]);
    const pts = parseSinaIntraday(json);
    expect(pts.length).toBe(2);
    expect(pts[0]).toEqual({ time: '09:30', price: 11.05 });
    expect(pts[1].time).toBe('09:31');
  });

  it('非法 JSON 返回空', () => {
    expect(parseSinaIntraday('not json')).toEqual([]);
  });
});
