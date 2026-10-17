// 阶段3 解析：腾讯 K线 / 分时 -> 领域对象（fixture 为 2026-10-16 真实接口返回格式）
import { describe, it, expect } from 'vitest';
import { parseTencentKline, parseTencentMinute } from '../../worker/parse';

describe('parseTencentKline', () => {
  it('解析多根日K（字段序：日期,开,收,高,低,量）', () => {
    const json = JSON.stringify({
      code: 0,
      data: {
        sh601929: {
          qfqday: [
            ['2026-10-09', '2.290', '2.500', '2.500', '2.230', '1997251.000'],
            ['2026-10-12', '2.600', '2.750', '2.750', '2.550', '5154402.000']
          ]
        }
      }
    });
    const candles = parseTencentKline(json, 'day');
    expect(candles.length).toBe(2);
    expect(candles[0]).toEqual({
      date: '2026-10-09',
      open: 2.29,
      close: 2.5,
      high: 2.5,
      low: 2.23,
      volume: 1997251
    });
    expect(candles[1].volume).toBe(5154402);
  });

  it('分钟K按 period 取 m30/m60 key（mkline 无 qfq 前缀）', () => {
    const json = JSON.stringify({
      code: 0,
      data: {
        sh601929: {
          m30: [['202610161400', '9.67', '9.68', '9.69', '9.65', '38904.000']],
          m60: [['202610161500', '9.67', '9.73', '9.77', '9.66', '192604.000']]
        }
      }
    });
    expect(parseTencentKline(json, 'm30')[0].volume).toBe(38904);
    expect(parseTencentKline(json, 'm60')[0].volume).toBe(192604);
  });

  it('无 qfq 前缀时回退裸 key', () => {
    const json = JSON.stringify({
      code: 0,
      data: { sh601929: { day: [['2026-10-16', '2.56', '2.48', '2.67', '2.45', '3100.000']] } }
    });
    expect(parseTencentKline(json, 'day')[0].close).toBe(2.48);
  });

  it('非法 JSON / 无 data 返回空', () => {
    expect(parseTencentKline('not json')).toEqual([]);
    expect(parseTencentKline('{"code":1}')).toEqual([]);
    expect(parseTencentKline('{"code":0,"data":{"sh601929":{}}}')).toEqual([]);
  });

  it('脏数据行过滤', () => {
    const json = JSON.stringify({
      code: 0,
      data: {
        sh601929: {
          qfqday: [
            ['2026-10-16', '2.56', '2.48', '2.67', '2.45', '3100.000'],
            ['bad', 'x', 'y', 'z', 'w', '1'],
            ['2026-10-15', '2.59', '2.53', '2.64', '2.49', '2695576.000']
          ]
        }
      }
    });
    const candles = parseTencentKline(json, 'day');
    expect(candles.length).toBe(2);
    // 按时间正序输出
    expect(candles[0].date).toBe('2026-10-15');
    expect(candles[1].date).toBe('2026-10-16');
  });
});

describe('parseTencentMinute', () => {
  it('解析分时点（HHmm 价格 量 额 → HH:MM）', () => {
    const json = JSON.stringify({
      code: 0,
      data: {
        sh601929: {
          data: {
            data: ['0930 2.56 20509 5250304.00', '0931 2.60 160185 41453654.00']
          }
        }
      }
    });
    const pts = parseTencentMinute(json);
    expect(pts.length).toBe(2);
    expect(pts[0]).toEqual({ time: '09:30', price: 2.56 });
    expect(pts[1]).toEqual({ time: '09:31', price: 2.6 });
  });

  it('非法 JSON / 无 data 返回空', () => {
    expect(parseTencentMinute('not json')).toEqual([]);
    expect(parseTencentMinute('{"code":1}')).toEqual([]);
    expect(parseTencentMinute('{"code":0,"data":{"sh601929":{"data":{}}}}')).toEqual([]);
  });
});
