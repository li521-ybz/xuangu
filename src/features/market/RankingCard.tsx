// 模块① 看盘总览 · 排行榜：涨幅 / 跌幅 / 成交额 / 换手率 / 主力净流入
// 全部基于同一份全市场快照本地排序，切 tab 不发请求（省流量、切换即时）。
import { useMemo, useState } from 'react';
import type { MarketRow } from '../../lib/types';
import { moneyText } from '../../lib/analytics';
import { pctText, trendOf } from '../../lib/format';
import { RANK_LABELS, topRanked, type RankKind } from '../../lib/marketStats';

interface Props {
  rows: MarketRow[];
  hasInflow: boolean;
  onPick?: (symbol: string) => void;
}

const TABS: RankKind[] = ['gain', 'loss', 'amount', 'turnover', 'inflow'];

export function RankingCard({ rows, hasInflow, onPick }: Props) {
  const [kind, setKind] = useState<RankKind>('gain');
  const tabs = TABS.filter((t) => t !== 'inflow' || hasInflow);
  const active: RankKind = tabs.includes(kind) ? kind : 'gain';
  const list = useMemo(() => topRanked(rows, active, 12), [rows, active]);

  /** 排行榜第三列随口径切换：比价类看涨跌幅，其余看自身指标 */
  const metricOf = (r: MarketRow): { text: string; cls: string } => {
    switch (active) {
      case 'amount':
        return { text: moneyText(r.amount), cls: '' };
      case 'turnover':
        return { text: `${(r.turnover ?? 0).toFixed(2)}%`, cls: '' };
      case 'inflow':
        return {
          text: r.mainInflow === undefined ? '—' : moneyText(r.mainInflow),
          cls: (r.mainInflow ?? 0) >= 0 ? 'up' : 'down'
        };
      default:
        return { text: pctText(r.changePct), cls: trendOf(r.changePct) };
    }
  };

  return (
    <section className="mk-card mk-rank-card" aria-label="排行榜">
      <header className="mk-card-head">
        <h3>排行榜</h3>
        <span className="mk-muted">点行看图表</span>
      </header>

      <div className="mk-rank-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active === t}
            className={`mk-rank-tab${active === t ? ' active' : ''}`}
            onClick={() => setKind(t)}
          >
            {RANK_LABELS[t]}
          </button>
        ))}
      </div>

      <ol className="mk-rank-list" data-testid="rank-list">
        {list.map((r, i) => {
          const m = metricOf(r);
          return (
            <li key={r.symbol}>
              <button
                type="button"
                className="mk-rank-row"
                onClick={() => onPick?.(r.symbol)}
                title={`${r.name} ${r.code} · 点击查看K线`}
              >
                <span className="mk-rank-no">{i + 1}</span>
                <span className="mk-rank-name">
                  <span className="nm">{r.name}</span>
                  <span className="cd">{r.code}</span>
                </span>
                <span className={`mk-rank-price num ${trendOf(r.changePct)}`}>
                  {r.price.toFixed(2)}
                </span>
                <span className={`mk-rank-metric num ${m.cls}`}>{m.text}</span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="mk-empty">暂无数据</li>}
      </ol>
    </section>
  );
}
