// 展示层格式化与配色（红涨绿跌：A 股惯例）
import type { Quote } from './types';

export type Trend = 'up' | 'down' | 'flat';

/** 根据涨跌额判定趋势：>0 涨(红) / <0 跌(绿) / =0 平 */
export function trendOf(change: number): Trend {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}

/** 涨跌额文本，涨带 + 号 */
export function changeText(change: number): string {
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}`;
}

/** 涨跌幅文本，带 % 与 + 号 */
export function pctText(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function priceText(price: number): string {
  return price.toFixed(2);
}

/** 返回 CSS class，供主题色上色（up=红 down=绿 flat=灰） */
export function quoteClass(q: Quote): Trend {
  return trendOf(q.change);
}
