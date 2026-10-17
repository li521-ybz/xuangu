// 模块③ 均线（MA）计算：简单移动平均，前 n-1 根数据不足置 null（ECharts 断线）
// 周期口径：日K 用 MA5/10/20/60（5/10/20/60 日线）；30分/60分用 MA13/MA25（13/25 根线）
import type { KlinePeriod } from '../../lib/chartClient';

export function movingAverage(closes: number[], n: number): (number | null)[] {
  if (n <= 0) return closes.map(() => null);
  return closes.map((_, i) => {
    if (i + 1 < n) return null;
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) sum += closes[j];
    return sum / n;
  });
}

/** 给定周期返回均线配置：日K 5/10/20/60，分钟（30分/60分）13/25 */
export const MA_BY_PERIOD: Record<KlinePeriod, number[]> = {
  day: [5, 10, 20, 60],
  m30: [13, 25],
  m60: [13, 25]
};
