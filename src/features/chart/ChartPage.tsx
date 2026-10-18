// 模块③ 图表区：日K(上) + 30分/60分(下，两张图同时常显)
// 2026-10-17 一页式仪表盘合并：由 App 作为 children 注入看板页右栏，
// 本组件只负责图表；原头部价格卡移除（价格/涨跌幅已在左表格三列中按行展示）。
// 2026-10-18 改版：原「分时(上) + 日K/30分/60分 Tab(下)」→「日K(上) + 30分/60分 两张图(下)」
import { useEffect, useState } from 'react';
import type { Candle } from '../../lib/types';
import { fetchDaily, type KlinePeriod } from '../../lib/chartClient';
import { ChartCanvas } from './ChartCanvas';

interface Props {
  symbol: string;
}

/** 单周期 K 线拉取：各自抓各自错，互不影响；symbol 或周期变化时重拉 */
function useCandles(symbol: string, period: KlinePeriod) {
  const [candles, setCandles] = useState<Candle[]>([]);
  useEffect(() => {
    let alive = true;
    fetchDaily(symbol, period)
      .then((dl) => {
        if (alive) setCandles(dl);
      })
      .catch(() => {
        if (alive) setCandles([]);
      });
    return () => {
      alive = false;
    };
  }, [symbol, period]);
  return candles;
}

export function ChartPage({ symbol }: Props) {
  const day = useCandles(symbol, 'day');
  const m30 = useCandles(symbol, 'm30');
  const m60 = useCandles(symbol, 'm60');

  return (
    <section className="charts" aria-label="图表区">
      {/* 日K：常显（上） */}
      <div className="chart-block" data-testid="day-chart">
        <h4>
          日K<span className="chart-cap">{symbol}</span>
        </h4>
        {day.length ? (
          <ChartCanvas points={day} kind="kline" period="day" />
        ) : (
          <p className="empty">暂无K线数据</p>
        )}
      </div>

      {/* 30分：常显（下） */}
      <div className="chart-block" data-testid="m30-chart">
        <h4>
          30分<span className="chart-cap">{symbol}</span>
        </h4>
        {m30.length ? (
          <ChartCanvas points={m30} kind="kline" period="m30" />
        ) : (
          <p className="empty">暂无K线数据</p>
        )}
      </div>

      {/* 60分：常显（下） */}
      <div className="chart-block" data-testid="m60-chart">
        <h4>
          60分<span className="chart-cap">{symbol}</span>
        </h4>
        {m60.length ? (
          <ChartCanvas points={m60} kind="kline" period="m60" />
        ) : (
          <p className="empty">暂无K线数据</p>
        )}
      </div>
    </section>
  );
}
