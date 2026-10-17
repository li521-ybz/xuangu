// 模块③ 图表画布：ECharts 封装（红涨绿跌）。jsdom 无 canvas 时安静降级。
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { Candle, IntradayPoint } from '../../lib/types';
import type { KlinePeriod } from '../../lib/chartClient';
import { MA_BY_PERIOD, movingAverage } from './ma';

interface Props {
  points: IntradayPoint[] | Candle[];
  kind: 'intraday' | 'kline';
  period?: KlinePeriod;
}

// 均线配色（用户指定，2026-10-17）：5/13 红、10 绿、20/25 蓝、60 黑；
// 红/绿取 K 线涨跌同源色，蓝/黑为独立指标色
const MA_COLORS: Record<number, string> = {
  5: '#e23c3c', // 红（涨色同源）
  10: '#1ba784', // 绿（跌色同源）
  13: '#e23c3c', // 红
  20: '#2f6bff', // 蓝
  25: '#2f6bff', // 蓝
  60: '#333333' // 黑
};
const maColor = (n: number) => MA_COLORS[n] ?? '#888888';

const UP = '#e23c3c';
const DOWN = '#1ba784';

export function buildOption(points: IntradayPoint[] | Candle[], kind: 'intraday' | 'kline', period: KlinePeriod = 'day') {
  if (kind === 'intraday') {
    const data = (points as IntradayPoint[]).map((p) => [p.time, p.price]);
    return {
      grid: { left: 40, right: 10, top: 10, bottom: 20 },
      xAxis: { type: 'category', data: data.map((d) => d[0]), axisLabel: { show: false } },
      yAxis: { type: 'value', scale: true },
      series: [{ type: 'line', data: data.map((d) => d[1]), showSymbol: false, lineStyle: { color: '#2f6bff' } }]
    };
  }
  const candles = points as Candle[];
  const dates = candles.map((c) => c.date);
  const closes = candles.map((c) => c.close);
  const maSeries = MA_BY_PERIOD[period].map((n) => {
    const values = movingAverage(closes, n);
    return {
      name: `MA${n}`,
      type: 'line' as const,
      data: dates.map((d, i) => [d, values[i]]),
      showSymbol: false,
      lineStyle: { width: 1, color: maColor(n) },
      itemStyle: { color: maColor(n) }
    };
  });
  const klineSeries = {
    type: 'candlestick' as const,
    data: candles.map((c) => [c.open, c.close, c.low, c.high]),
    itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN }
  };

  if (period === 'day') {
    // 日K：上 K线+均线、下 成交量（双 grid；成交量红涨绿跌，与 K 线实体同源）
    return {
      grid: [
        { left: 52, right: 14, top: 18, height: '42%' },
        { left: 52, right: 14, top: '62%', height: '20%' }
      ],
      xAxis: [
        { type: 'category', data: dates, gridIndex: 0, axisLabel: { show: false } },
        { type: 'category', data: dates, gridIndex: 1, axisLabel: { show: false } }
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, scale: true, axisLabel: { fontSize: 10 } },
        {
          type: 'value',
          gridIndex: 1,
          splitNumber: 2,
          axisLabel: { fontSize: 10, formatter: (v: number) => (v >= 1e4 ? `${v / 1e4}万` : String(v)) }
        }
      ],
      series: [
        { ...klineSeries, xAxisIndex: 0, yAxisIndex: 0 },
        ...maSeries.map((s) => ({ ...s, xAxisIndex: 0, yAxisIndex: 0 })),
        {
          name: '成交量',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: candles.map((c) => ({ value: c.volume, itemStyle: { color: c.close >= c.open ? UP : DOWN } }))
        }
      ]
    };
  }

  // 30分/60分：单 grid，K线 + MA13/MA25（无成交量）
  return {
    grid: { left: 52, right: 14, top: 18, bottom: 20 },
    xAxis: { type: 'category', data: dates, axisLabel: { show: false } },
    yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10 } },
    series: [klineSeries, ...maSeries]
  };
}

export function ChartCanvas({ points, kind, period = 'day' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    let chart: echarts.ECharts | undefined;
    try {
      chart = echarts.init(ref.current);
      chart.setOption(buildOption(points, kind, period));
    } catch {
      // jsdom 无 canvas 支持，测试环境下忽略
    }
    return () => {
      try {
        chart?.dispose();
      } catch {
        /* noop */
      }
    };
  }, [points, kind, period]);

  return <div ref={ref} className="echart" style={{ width: '100%', height: kind === 'kline' && period === 'day' ? 340 : 240 }} />;
}
