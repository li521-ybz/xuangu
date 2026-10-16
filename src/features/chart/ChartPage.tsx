// 模块③ 个股详情页：头部（价格/涨跌幅）+ 分时图(上) + 日K(下) 同屏常显 + 周期 Tab
import { useEffect, useState } from 'react';
import type { Candle, IntradayPoint, Quote } from '../../lib/types';
import { fetchDaily, fetchIntraday } from '../../lib/chartClient';
import { ChartCanvas } from './ChartCanvas';
import { changeText, pctText, quoteClass } from '../../lib/format';

type Period = 'day' | 'week' | 'month';

interface Props {
  symbol: string;
  quote?: Quote;
}

export function ChartPage({ symbol, quote }: Props) {
  const [intraday, setIntraday] = useState<IntradayPoint[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [period, setPeriod] = useState<Period>('day');

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchIntraday(symbol).catch(() => [] as IntradayPoint[]),
      fetchDaily(symbol).catch(() => [] as Candle[])
    ])
      .then(([id, dl]) => {
        if (!alive) return;
        setIntraday(id);
        setCandles(dl);
      })
      .catch(() => {
        /* 保持空，UI 显示暂无数据 */
      });
    return () => {
      alive = false;
    };
  }, [symbol]);

  return (
    <section className="detail" aria-label="个股详情">
      <header className={`detail-head ${quote ? quoteClass(quote) : ''}`}>
        <div className="price">{quote ? quote.price.toFixed(2) : symbol}</div>
        {quote && (
          <div className="sub">
            {pctText(quote.changePct)} {quote.change >= 0 ? '▲' : '▼'}（{changeText(quote.change)}）
          </div>
        )}
        <div className="sym">{symbol}</div>
      </header>

      {/* 分时图：常显（上） */}
      <div className="chart-block" data-testid="intraday-chart">
        <h4>分时</h4>
        {intraday.length ? (
          <ChartCanvas points={intraday} kind="intraday" />
        ) : (
          <p className="empty">暂无分时数据</p>
        )}
      </div>

      {/* 日K：常显（下），周期 Tab 切换 日K/周K/月K */}
      <div className="chart-block" data-testid="kline-chart">
        <div className="period-tabs" role="tablist" aria-label="K线周期">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={period === p}
              className={period === p ? 'active' : ''}
              onClick={() => setPeriod(p)}
            >
              {p === 'day' ? '日K' : p === 'week' ? '周K' : '月K'}
            </button>
          ))}
        </div>
        {candles.length ? (
          <ChartCanvas points={candles} kind="kline" />
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
