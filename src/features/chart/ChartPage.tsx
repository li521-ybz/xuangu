// 模块③ 图表区：分时图(上) + K线(下，周期 Tab 日K/30分/60分) 同屏常显
// 2026-10-17 一页式仪表盘合并：由 App 作为 children 注入看板页右栏，
// 本组件只负责图表；原头部价格卡移除（价格/涨跌幅已在左表格三列中按行展示）
import { useEffect, useState } from 'react';
import type { Candle, IntradayPoint } from '../../lib/types';
import { fetchDaily, fetchIntraday, type KlinePeriod } from '../../lib/chartClient';
import { ChartCanvas } from './ChartCanvas';

interface Props {
  symbol: string;
}

export function ChartPage({ symbol }: Props) {
  const [intraday, setIntraday] = useState<IntradayPoint[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [period, setPeriod] = useState<KlinePeriod>('day');

  // 分时与日K：symbol 变化时拉取（各抓各的错，互不影响）
  useEffect(() => {
    let alive = true;
    fetchIntraday(symbol)
      .then((id) => {
        if (alive) setIntraday(id);
      })
      .catch(() => {
        if (alive) setIntraday([]);
      });
    return () => {
      alive = false;
    };
  }, [symbol]);

  // K 线：symbol 或周期（日K/30分/60分）变化时重新拉取
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

  return (
    <section className="charts" aria-label="图表区">
      {/* 分时图：常显（上） */}
      <div className="chart-block" data-testid="intraday-chart">
        <h4>
          分时<span className="chart-cap">{symbol}</span>
        </h4>
        {intraday.length ? (
          <ChartCanvas points={intraday} kind="intraday" />
        ) : (
          <p className="empty">暂无分时数据</p>
        )}
      </div>

      {/* 日K/分钟K：常显（下），周期 Tab 切换 日K/30分/60分 */}
      <div className="chart-block" data-testid="kline-chart">
        <div className="period-tabs" role="tablist" aria-label="K线周期">
          {(['day', 'm30', 'm60'] as KlinePeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              className={period === p ? 'active' : ''}
              onClick={() => setPeriod(p)}
            >
              {p === 'day' ? '日K' : p === 'm30' ? '30分' : '60分'}
            </button>
          ))}
        </div>
        {candles.length ? (
          <ChartCanvas points={candles} kind="kline" period={period} />
        ) : (
          <p className="empty">暂无K线数据</p>
        )}
        <span data-testid="period" hidden>
          {period}
        </span>
      </div>
    </section>
  );
}
