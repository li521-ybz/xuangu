// 模块③ 持仓页：汇总卡 + 持仓表 + 成本基准净值曲线 + 交易流水
// 交互：录入交易（自动带名称/现价/费用）、行内卖出（预填该股）、删除流水、清空重来。
import { useState } from 'react';
import { usePortfolio } from './usePortfolio';
import { TradeModal } from './TradeModal';
import { EquityChart } from '../common/EquityChart';
import { maxDrawdown } from '../../lib/analytics';
import { pctText, trendOf } from '../../lib/format';
import type { Trade } from '../../lib/types';

interface Props {
  onOpenStock?: (symbol: string) => void;
}

const SIDE_TEXT: Record<Trade['side'], string> = { buy: '买入', sell: '卖出' };

export function PortfolioPage({ onOpenStock }: Props) {
  const { trades, equity, rows, summary, error, addTrade, removeTrade, clearAll, refresh } = usePortfolio();
  const [modal, setModal] = useState<null | { preset?: { symbol?: string; name?: string; price?: number; side?: 'buy' | 'sell' } }>(null);
  const [tab, setTab] = useState<'hold' | 'flow'>('hold');

  const dd = maxDrawdown(equity);
  const clsPnl = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
  const money = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="pf-page" data-testid="portfolio-page">
      <header className="wb-page-head">
        <h2>持仓</h2>
        <div className="wb-head-tools">
          <button type="button" className="tool-btn" aria-label="刷新持仓行情" title="刷新" onClick={() => void refresh()}>
            ↻
          </button>
          <button type="button" className="tool-btn tool-btn-primary wide" onClick={() => setModal({})}>
            ＋ 录入交易
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {/* 汇总 */}
      <section className="pf-summary" aria-label="持仓汇总">
        <div className="pf-metric">
          <span className="k">持仓市值</span>
          <span className="v num">{money(summary.marketValue)}</span>
        </div>
        <div className="pf-metric">
          <span className="k">持仓成本</span>
          <span className="v num">{money(summary.costAmount)}</span>
        </div>
        <div className="pf-metric">
          <span className="k">浮动盈亏</span>
          <span className={`v num ${clsPnl(summary.floatPnl)}`}>
            {summary.floatPnl >= 0 ? '+' : ''}
            {money(summary.floatPnl)}
            <span className="sub">{pctText(summary.floatPct)}</span>
          </span>
        </div>
        <div className="pf-metric">
          <span className="k">当日盈亏</span>
          <span className={`v num ${clsPnl(summary.dayPnl)}`}>
            {summary.dayPnl >= 0 ? '+' : ''}
            {money(summary.dayPnl)}
          </span>
        </div>
        <div className="pf-metric">
          <span className="k">已实现盈亏</span>
          <span className={`v num ${clsPnl(summary.realizedTotal)}`}>
            {summary.realizedTotal >= 0 ? '+' : ''}
            {money(summary.realizedTotal)}
          </span>
        </div>
        <div className="pf-metric">
          <span className="k">净值最大回撤</span>
          <span className="v num down">{dd.toFixed(2)}%</span>
        </div>
      </section>

      {/* 持仓 / 流水 切换 */}
      <div className="segmented" role="tablist" aria-label="持仓视图">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'hold'}
          className={`seg${tab === 'hold' ? ' active' : ''}`}
          onClick={() => setTab('hold')}
        >
          持仓明细 {rows.length > 0 ? `(${rows.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'flow'}
          className={`seg${tab === 'flow' ? ' active' : ''}`}
          onClick={() => setTab('flow')}
        >
          交易流水 {trades.length > 0 ? `(${trades.length})` : ''}
        </button>
      </div>

      {tab === 'hold' &&
        (rows.length === 0 ? (
          <p className="empty">暂无持仓，点右上「录入交易」记一笔买入</p>
        ) : (
          <div className="pf-table" role="table" aria-label="持仓明细">
            <div className="pf-thead" role="row">
              <span>名称 / 代码</span>
              <span className="num">数量</span>
              <span className="num">成本</span>
              <span className="num">现价</span>
              <span className="num">涨跌幅</span>
              <span className="num">市值</span>
              <span className="num">浮动盈亏</span>
              <span className="num hide-sm">当日</span>
              <span className="num hide-sm">占比</span>
              <span className="op" />
            </div>
            {rows.map((r) => (
              <div className="pf-row" role="row" key={r.symbol} data-testid={`hold-${r.symbol}`}>
                <button
                  type="button"
                  className="pf-name"
                  onClick={() => onOpenStock?.(r.symbol)}
                  title="查看K线"
                >
                  <span className="nm">{r.name}</span>
                  <span className="cd">{r.symbol}</span>
                </button>
                <span className="num">{r.qty.toLocaleString('zh-CN')}</span>
                <span className="num">{r.cost.toFixed(3)}</span>
                <span className={`num ${trendOf(r.changePct)}`}>{r.price.toFixed(2)}</span>
                <span className={`num ${trendOf(r.changePct)}`}>{pctText(r.changePct)}</span>
                <span className="num">{money(r.marketValue)}</span>
                <span className={`num ${clsPnl(r.floatPnl)}`}>
                  {r.floatPnl >= 0 ? '+' : ''}
                  {money(r.floatPnl)}
                  <span className="sub">{pctText(r.floatPct)}</span>
                </span>
                <span className={`num hide-sm ${clsPnl(r.dayPnl)}`}>
                  {r.dayPnl >= 0 ? '+' : ''}
                  {money(r.dayPnl)}
                </span>
                <span className="num hide-sm">{r.weight.toFixed(1)}%</span>
                <span className="op">
                  <button
                    type="button"
                    className="row-sell"
                    aria-label={`卖出 ${r.name}`}
                    onClick={() =>
                      setModal({ preset: { symbol: r.symbol, name: r.name, price: r.price, side: 'sell' } })
                    }
                  >
                    卖
                  </button>
                </span>
              </div>
            ))}
          </div>
        ))}

      {tab === 'flow' &&
        (trades.length === 0 ? (
          <p className="empty">暂无交易流水</p>
        ) : (
          <>
            <div className="pf-table pf-flow" role="table" aria-label="交易流水">
              <div className="pf-thead" role="row">
                <span>日期</span>
                <span>名称 / 代码</span>
                <span className="num">方向</span>
                <span className="num">价格</span>
                <span className="num">数量</span>
                <span className="num">费用</span>
                <span className="num">成交额</span>
                <span className="op" />
              </div>
              {[...trades]
                .sort((a, b) => (b.date + String(b.seq ?? 0)).localeCompare(a.date + String(a.seq ?? 0)))
                .map((t) => (
                  <div className="pf-row" role="row" key={t.id}>
                    <span className="num">{t.date}</span>
                    <button type="button" className="pf-name" onClick={() => onOpenStock?.(t.symbol)}>
                      <span className="nm">{t.name}</span>
                      <span className="cd">{t.symbol}</span>
                    </button>
                    <span className={`num ${t.side === 'buy' ? 'up' : 'down'}`}>{SIDE_TEXT[t.side]}</span>
                    <span className="num">{t.price.toFixed(3)}</span>
                    <span className="num">{t.qty.toLocaleString('zh-CN')}</span>
                    <span className="num">{t.fee.toFixed(2)}</span>
                    <span className="num">{money(t.price * t.qty)}</span>
                    <span className="op">
                      <button
                        type="button"
                        className="row-del"
                        aria-label={`删除 ${t.date} ${t.name} 流水`}
                        onClick={() => removeTrade(t.id)}
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                ))}
            </div>
            <button type="button" className="pf-clear" onClick={clearAll}>
              清空全部流水与净值记录
            </button>
          </>
        ))}

      {/* 净值曲线 */}
      <section className="mk-card pf-equity" aria-label="组合净值">
        <header className="mk-card-head">
          <h3>组合净值曲线</h3>
          <span className="mk-muted">成本基准 100 · 每日快照</span>
        </header>
        <EquityChart points={equity} baseline={100} ariaLabel="组合净值曲线" />
      </section>

      {modal && <TradeModal preset={modal.preset} onAdd={addTrade} onClose={() => setModal(null)} />}
    </div>
  );
}
