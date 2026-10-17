// 模块③ 均线计算：movingAverage 边界 + MA_BY_PERIOD 口径
import { describe, it, expect } from 'vitest';
import { movingAverage, MA_BY_PERIOD } from './ma';

describe('movingAverage', () => {
  it('n=2：前 1 位 null，其后为窗口均值', () => {
    expect(movingAverage([1, 2, 3, 4, 5], 2)).toEqual([null, 1.5, 2.5, 3.5, 4.5]);
  });

  it('窗口内取算术平均（不取整）', () => {
    const r = movingAverage([10, 20, 31], 3);
    expect(r).toEqual([null, null, 61 / 3]);
  });

  it('n > 数据长度时全 null', () => {
    expect(movingAverage([1, 2], 5)).toEqual([null, null]);
  });

  it('n=1 原样透传', () => {
    expect(movingAverage([3, 1, 2], 1)).toEqual([3, 1, 2]);
  });

  it('空数组返回空', () => {
    expect(movingAverage([], 5)).toEqual([]);
  });
});

describe('MA_BY_PERIOD', () => {
  it('日K 5/10/20/60，30分/60分 13/25', () => {
    expect(MA_BY_PERIOD.day).toEqual([5, 10, 20, 60]);
    expect(MA_BY_PERIOD.m30).toEqual([13, 25]);
    expect(MA_BY_PERIOD.m60).toEqual([13, 25]);
  });
});
