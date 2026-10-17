// 模块① 自选看板页：一页式仪表盘布局（2026-10-17 起，替代原宽屏双栏）
// 宽屏：左侧竖排分组导航 + 右侧「股票表格（三列）→ 图表区（children 注入模块③）」
// 窄屏：纵向堆叠（分组横排 chips → 表格 → 图表）
// 首列严格只显示股票代码（用户拍板，2026-10-17）
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StockRepository } from '../../lib/repository';
import { bareSymbol } from '../../lib/symbol';
import { groupsOf, useWatchlist } from './useWatchlist';
import { AddStockModal } from './AddStockModal';
import { useQuotes } from '../quotes/useQuotes';
import { pctText, quoteClass } from '../../lib/format';

interface Props {
  repo: StockRepository;
  selected?: string | null;
  onSelect?: (symbol: string | null) => void;
  onOpenSettings?: () => void;
  children?: ReactNode; // 图表区插槽：App 组合注入 <ChartPage>，模块边界不互相 import
}

const ALL = '全部';

export function WatchlistPage({ repo, selected, onSelect, onOpenSettings, children }: Props) {
  const { stocks, loading, error, load, add, remove } = useWatchlist(repo);
  const [filter, setFilter] = useState<string>(ALL);
  const [adding, setAdding] = useState(false);

  const symbols = useMemo(() => stocks.map((s) => s.symbol), [stocks]);
  const { quotes, degraded, refresh } = useQuotes(symbols);

  const groups = useMemo(() => groupsOf(stocks), [stocks]);
  const visible = useMemo(
    () => (filter === ALL ? stocks : stocks.filter((s) => s.group === filter)),
    [stocks, filter]
  );

  const onRefresh = () => {
    void load();
    void refresh();
  };

  // 默认选中：加载完成后若无有效选中（首次进入/选中项被删），选中当前筛选第一个，
  // 图表区立即可见（一页式仪表盘的核心体验：进来就能看图，无需先点行）
  useEffect(() => {
    if (loading) return;
    const exists = !!selected && stocks.some((s) => s.symbol === selected);
    if (!exists && visible[0]) onSelect?.(visible[0].symbol);
  }, [loading, selected, stocks, visible, onSelect]);

  return (
    <section className="watchlist" aria-label="自选股看板">
      <nav className="group-side" aria-label="分组筛选">
        {[ALL, ...groups].map((g) => (
          <button
            key={g}
            type="button"
            className={g === filter ? 'tab active' : 'tab'}
            aria-pressed={g === filter}
            onClick={() => setFilter(g)}
          >
            {g}
          </button>
        ))}
      </nav>

      <div className="board-main">
        <header className="navbar">
          <h2 className="navbar-title">自选股</h2>
          <div className="navbar-tools">
            <button className="tool-btn" aria-label="刷新" title="刷新" onClick={onRefresh}>
              ↻
            </button>
            {onOpenSettings && (
              <button className="tool-btn" aria-label="设置" title="设置" onClick={onOpenSettings}>
                ⚙
              </button>
            )}
            <button className="tool-btn tool-btn-primary" aria-label="添加自选" title="添加自选" onClick={() => setAdding(true)}>
              ＋
            </button>
          </div>
        </header>

        {error && <p className="error">{error}</p>}
        {loading && <p className="loading">加载中…</p>}
        {degraded && <p className="error">行情部分降级（沿用上次数据）</p>}

        {!loading && visible.length === 0 ? (
          <p className="empty">暂无自选，点 ＋ 添加</p>
        ) : (
          <div className="stock-table" role="table" aria-label="自选股列表">
            <div className="tbl-head" role="row">
              <span role="columnheader">股票代码</span>
              <span role="columnheader">现价</span>
              <span role="columnheader">涨跌幅</span>
              <span className="tbl-op" aria-hidden="true" />
            </div>
            <ul className="stock-list" role="rowgroup">
              {visible.map((s) => {
                const q = quotes[bareSymbol(s.symbol)];
                const cls = q ? quoteClass(q) : 'flat';
                return (
                  <li
                    key={s.id}
                    role="row"
                    className={`stock-row${selected === s.symbol ? ' selected' : ''}`}
                    aria-current={selected === s.symbol ? 'true' : undefined}
                    onClick={() => onSelect?.(s.symbol)}
                    data-testid={`row-${s.symbol}`}
                  >
                    <span className="cell-code" role="cell">
                      {s.symbol}
                    </span>
                    <span className={`cell-price num ${cls}`} role="cell">
                      {q ? q.price.toFixed(2) : '—'}
                    </span>
                    <span className={`cell-pct num ${cls}`} role="cell">
                      {q ? `${pctText(q.changePct)} ${q.change >= 0 ? '▲' : '▼'}` : '—'}
                    </span>
                    <button
                      aria-label={`删除 ${s.name}`}
                      className="row-del"
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(s.id);
                      }}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {children}

        {adding && (
          <AddStockModal
            groups={groups}
            onAdd={async (input) => {
              await add(input);
            }}
            onClose={() => setAdding(false)}
          />
        )}
      </div>
    </section>
  );
}
