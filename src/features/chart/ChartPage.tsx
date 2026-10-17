// 模块③ 个股详情页：头部（价格/涨跌幅）+ 分时图(上) + 日K(下) 同屏常显 + 周期 Tab
import { useEffect, useState } from 'react';
import type { Candle, IntradayPoint, Quote } from '../../lib/types';
import { fetchDaily, fetchIntraday, type KlinePeriod } from '../../lib/chartClient';
import { ChartCanvas } from './ChartCanvas';
import { changeText, pctText, quoteClass } from '../../lib/format';
import { useQuotes } from '../quotes/useQuotes';
import { bareSymbol } from '../../lib/symbol';

interface Props {
  symbol: string;
  quote?: Quote;
}

export function ChartPage({ symbol, quote }: Props) {
  const [intraday, setIntraday] = useState<IntradayPoint[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [period, setPeriod] = useState<KlinePeriod>('day');
  // 头部实时行情：App 不传 quote（历史设计），由本页自取；传入时以 prop 优先（测试注入/复用）
  const { quotes: liveQuotes } = useQuotes([symbol]);
  const q: Quote | undefined = quote ?? liveQuotes[bareSymbol(symbol)];

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
    <section className="detail" aria-label="个股详情">
      <header className={`detail-head ${q ? quoteClass(q) : ''}`}>
        <div className="price">{q ? q.price.toFixed(2) : symbol}</div>
        {q && (
          <div className="sub">
            {pctText(q.changePct)} {q.change >= 0 ? '▲' : '▼'}（{changeText(q.change)}）
          </div>
        )}
        <div className="sym">{q?.name ? `${q.name} · ${symbol}` : symbol}</div>
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

      {/* 日K/分钟K：常显（下），周期 Tab 切换 日K/30分/60分 */}
      <div className="chart-block" data-testid="kline-chart">
        <div className="period-tabs" role="tablist" aria-label="K线周期">
          {(['day', 'm30', 'm60'] as KlinePeriod[]).map((p) => (
            <button
              key={p}
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
