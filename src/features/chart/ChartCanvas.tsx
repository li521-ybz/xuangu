// 模块③ 图表画布：ECharts 封装（红涨绿跌）。jsdom 无 canvas 时安静降级。
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { Candle, IntradayPoint } from '../../lib/types';

interface Props {
  points: IntradayPoint[] | Candle[];
  kind: 'intraday' | 'kline';
}

function buildOption(points: IntradayPoint[] | Candle[], kind: 'intraday' | 'kline') {
  if (kind === 'intraday') {
    const data = (points as IntradayPoint[]).map((p) => [p.time, p.price]);
    return {
      grid: { left: 40, right: 10, top: 10, bottom: 20 },
      xAxis: { type: 'category', data: data.map((d) => d[0]), axisLabel: { show: false } },
      yAxis: { type: 'value', scale: true },
      series: [{ type: 'line', data: data.map((d) => d[1]), showSymbol: false, lineStyle: { color: '#2f6bff' } }]
    };
  }
  const data = (points as Candle[]).map((c) => [c.date, c.open, c.close, c.low, c.high]);
  return {
    grid: { left: 40, right: 10, top: 10, bottom: 20 },
    xAxis: { type: 'category', data: data.map((d) => d[0]), axisLabel: { show: false } },
    yAxis: { type: 'value', scale: true },
    series: [
      {
        type: 'candlestick',
        data: data.map((d) => [d[1], d[2], d[3], d[4]]),
        itemStyle: { color: '#e23c3c', color0: '#1ba784', borderColor: '#e23c3c', borderColor0: '#1ba784' }
      }
    ]
  };
}

export function ChartCanvas({ points, kind }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    let chart: echarts.ECharts | undefined;
    try {
      chart = echarts.init(ref.current);
      chart.setOption(buildOption(points, kind));
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
  }, [points, kind]);

  return <div ref={ref} className="echart" style={{ width: '100%', height: 240 }} />;
}
