// 模块⑤ 模拟盘页：账户总览 + 下单 + 持仓/委托/成交 + 权益曲线与绩效
import { useMemo, useState } from 'react';
import { useSim } from './useSim';
import { OrderPanel } from './OrderPanel';
import { EquityChart } from '../common/EquityChart';
import { positionCost, type SimOrder } from './sim';
import { summarize } from '../../lib/analytics';
import { pctText, trendOf } from '../../lib/format';

interface Props {
  onOpenStock?: (symbol: string) => void;
}

const STATUS_TEXT: Record<SimOrder['status'], string> = {
  filled: '已成交',
  pending: '挂单中',
  cancelled: '已撤销'
};

export function SimPage({ onOpenStock }: Props) {
  const { state, error, notice, setNotice, submit, reset, refresh, prices } = useSim();
  const [tab, setTab] = useState<'pos' | 'order' | 'deal'>('pos');
  const [confirmReset, setConfirmReset] = useState(false);

  const { account, positions, orders, equity } = state;

  const marketValue = positions.reduce((s, p) => {
    const price = prices[p.symbol.replace(/^[a-z]{2}/, '')] ?? prices[p.symbol] ?? positionCost(p);
    return s + price * p.qty;
  }, 0);
  const total = account.cash + marketValue;
  const totalPnl = total - account.initialCash;
  const returnPct = account.initialCash > 0 ? (totalPnl / account.initialCash) * 100 : 0;

  const closed = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'filled' && o.side === 'sell' && typeof o.realized === 'number')
        .map((o) => ({ pnl: o.realized as number })),
    [orders]
  );
  const perf = useMemo(() => summarize(equity, closed), [equity, closed]);

  const pending = orders.filter((o) => o.status === 'pending');
  const deals = orders.filter((o) => o.status === 'filled');
  const money = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cls = (v: number) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

  return (
    <div className="sim-page" data-testid="sim-page">
      <header className="wb-page-head">
        <h2>模拟盘</h2>
        <div className="wb-head-tools">
          <button type="button" className="tool-btn" aria-label="刷新模拟盘行情" title="刷新" onClick={() => void refresh()}>
            ↻
          </button>
          {confirmReset ? (
            <>
              <button
                type="button"
                className="tool-btn wide danger"
                onClick={() => {
                  reset(account.initialCash);
                  setConfirmReset(false);
                }}
              >
                确认重置
              </button>
              <button type="button" className="tool-btn wide" onClick={() => setConfirmReset(false)}>
                取消
              </button>
            </>
          ) : (
            <button type="button" className="tool-btn wide" onClick={() => setConfirmReset(true)}>
              重置账户
            </button>
          )}
        </div>
      </header>

      {(error || notice) && (
        <p className={error ? 'error' : 'ok'} role="status" onClick={() => setNotice(null)}>
          {error ?? notice}
        </p>
      )}

      <section className="pf-summary" aria-label="模拟账户总览">
        <div className="pf-metric">
          <span className="k">总资产</span>
          <span className="v num">{money(total)}</span>
        </div>
        <div className="pf-metric">
          <span className="k">可用资金</span>
          <span className="v num">{money(account.cash)}</span>
        </div>
        <div className="pf-metric">
          <span className="k">持仓市值</span>
          <span className="v num">{money(marketValue)}</span>
        </div>
        <div className="pf-metric">
          <span className="k">总盈亏</span>
          <span className={`v num ${cls(totalPnl)}`}>
            {totalPnl >= 0 ? '+' : ''}
            {money(totalPnl)}
            <span className="sub">{pctText(returnPct)}</span>
          </span>
        </div>
        <div className="pf-metric">
          <span className="k">最大回撤</span>
          <span className="v num">{perf.maxDrawdown.toFixed(2)}%</span>
        </div>
        <div className="pf-metric">
          <span className="k">胜率 / 盈亏比</span>
          <span className="v num">
            {perf.trades > 0 ? `${perf.winRate.toFixed(0)}% / ${perf.profitFactor.toFixed(2)}` : '—'}
          </span>
        </div>
      </section>

      <div className="sim-grid">
        <OrderPanel cash={account.cash} prices={prices} onSubmit={submit} />

        <section className="mk-card sim-lists">
          <div className="segmented" role="tablist" aria-label="模拟盘明细">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'pos'}
              className={`seg${tab === 'pos' ? ' active' : ''}`}
              onClick={() => setTab('pos')}
            >
              持仓 ({positions.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'order'}
              className={`seg${tab === 'order' ? ' active' : ''}`}
              onClick={() => setTab('order')}
            >
              委托 ({pending.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'deal'}
              className={`seg${tab === 'deal' ? ' active' : ''}`}
              onClick={() => setTab('deal')}
            >
              成交 ({deals.length})
            </button>
          </div>

          {tab === 'pos' &&
            (positions.length === 0 ? (
              <p className="empty">暂无持仓，左侧下单买入试试</p>
            ) : (
              <div className="sim-table" role="table">
                <div className="sim-thead" role="row">
                  <span>名称 / 代码</span>
                  <span className="num">持仓</span>
                  <span className="num">可卖</span>
                  <span className="num">成本</span>
                  <span className="num">现价</span>
                  <span className="num">盈亏</span>
                </div>
                {positions.map((p) => {
                  const price = prices[p.symbol.replace(/^[a-z]{2}/, '')] ?? prices[p.symbol] ?? positionCost(p);
                  const pnl = price * p.qty - p.costAmount;
                  return (
                    <div className="sim-row" role="row" key={p.symbol}>
                      <button type="button" className="pf-name" onClick={() => onOpenStock?.(p.symbol)}>
                        <span className="nm">{p.name}</span>
                        <span className="cd">{p.symbol}</span>
                      </button>
                      <span className="num">{p.qty.toLocaleString('zh-CN')}</span>
                      <span className="num">{p.availableQty.toLocaleString('zh-CN')}</span>
                      <span className="num">{positionCost(p).toFixed(3)}</span>
                      <span className={`num ${trendOf(price - positionCost(p))}`}>{price.toFixed(2)}</span>
                      <span className={`num ${cls(pnl)}`}>
                        {pnl >= 0 ? '+' : ''}
                        {money(pnl)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

          {tab === 'order' &&
            (pending.length === 0 ? (
              <p className="empty">暂无挂单（限价单未到价时在这里等待撮合）</p>
            ) : (
              <div className="sim-table" role="table">
                <div className="sim-thead" role="row">
                  <span>名称 / 代码</span>
                  <span className="num">方向</span>
                  <span className="num">委托价</span>
                  <span className="num">数量</span>
                  <span className="num">状态</span>
                </div>
                {pending.map((o) => (
                  <div className="sim-row" role="row" key={o.id}>
                    <span className="pf-name static">
                      <span className="nm">{o.name}</span>
                      <span className="cd">{o.symbol}</span>
                    </span>
                    <span className={`num ${o.side === 'buy' ? 'up' : 'down'}`}>
                      {o.side === 'buy' ? '买入' : '卖出'}
                    </span>
                    <span className="num">{o.price.toFixed(2)}</span>
                    <span className="num">{o.qty.toLocaleString('zh-CN')}</span>
                    <span className="num">{STATUS_TEXT[o.status]}</span>
                  </div>
                ))}
              </div>
            ))}

          {tab === 'deal' &&
            (deals.length === 0 ? (
              <p className="empty">暂无成交</p>
            ) : (
              <div className="sim-table" role="table">
                <div className="sim-thead" role="row">
                  <span>时间</span>
                  <span>名称 / 代码</span>
                  <span className="num">方向</span>
                  <span className="num">成交价</span>
                  <span className="num">数量</span>
                  <span className="num">费用</span>
                  <span className="num">实现盈亏</span>
                </div>
                {deals.map((o) => (
                  <div className="sim-row" role="row" key={o.id}>
                    <span className="num">{(o.filledAt ?? o.createdAt).slice(5, 16).replace('T', ' ')}</span>
                    <span className="pf-name static">
                      <span className="nm">{o.name}</span>
                      <span className="cd">{o.symbol}</span>
                    </span>
                    <span className={`num ${o.side === 'buy' ? 'up' : 'down'}`}>
                      {o.side === 'buy' ? '买入' : '卖出'}
                    </span>
                    <span className="num">{(o.fillPrice ?? 0).toFixed(2)}</span>
                    <span className="num">{o.qty.toLocaleString('zh-CN')}</span>
                    <span className="num">{(o.fee ?? 0).toFixed(2)}</span>
                    <span className={`num ${cls(o.realized ?? 0)}`}>
                      {o.side === 'sell' ? `${(o.realized ?? 0) >= 0 ? '+' : ''}${money(o.realized ?? 0)}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ))}
        </section>
      </div>

      <section className="mk-card" aria-label="模拟账户权益曲线">
        <header className="mk-card-head">
          <h3>权益曲线</h3>
          <span className="mk-muted">
            初始资金 {account.initialCash.toLocaleString('zh-CN')} 元 · 按交易日记录
          </span>
        </header>
        <EquityChart
          points={equity}
          baseline={account.initialCash}
          format={(v) => (v / 10000).toFixed(1) + '万'}
          ariaLabel="模拟账户权益曲线"
        />
      </section>
    </div>
  );
}
