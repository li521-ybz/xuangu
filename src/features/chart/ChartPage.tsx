// 模块③ 图表区：日K(上，常显) + 分钟K(下，30分/60分 Tab 切换)
// 2026-10-17 一页式仪表盘合并：由 App 作为 children 注入看板页右栏，
// 本组件只负责图表；原头部价格卡移除（价格/涨跌幅已在左表格三列中按行展示）。
// 2026-10-18 改版两轮：① 原「分时(上) + 日K/30分/60分 Tab(下)」→ 日K(上) + 30分/60分 双图同屏；
//   ②（本轮）下方 30分/60分 退回上一版 Tab 切换（日K 保持上方常显）。
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
  const [minutePeriod, setMinutePeriod] = useState<KlinePeriod>('m30');
  const minute = useCandles(symbol, minutePeriod);

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

      {/* 分钟K：30分/60分 Tab 切换（下，上一版交互） */}
      <div className="chart-block" data-testid="minute-chart">
        <div className="period-tabs" role="tablist" aria-label="分钟K周期">
          {(['m30', 'm60'] as KlinePeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={minutePeriod === p}
              className={minutePeriod === p ? 'active' : ''}
              onClick={() => setMinutePeriod(p)}
            >
              {p === 'm30' ? '30分' : '60分'}
            </button>
          ))}
        </div>
        {minute.length ? (
          <ChartCanvas points={minute} kind="kline" period={minutePeriod} />
        ) : (
          <p className="empty">暂无K线数据</p>
        )}
        <span data-testid="minute-period" hidden>
          {minutePeriod}
        </span>
      </div>
    </section>
  );
}
