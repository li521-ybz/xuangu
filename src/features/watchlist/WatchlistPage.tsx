// 模块① 自选看板页：三栏终端布局（2026-10-17 起，按用户手绘图）
// 宽屏：左竖排分组导航 + 中股票列表列 + 右主区「信息条 → 图表（children 注入模块③）」
// 窄屏：纵向堆叠（分组横排 chips → 列表 → 主区）
// 列表行显示名称+代码（用户 2026-10-17 拍板）；信息条只显示当前选中股票的 代码/现价/涨跌幅
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

  // 选中股票的实时行情（信息条用；与列表同源，不重复请求）
  const sq = selected ? quotes[bareSymbol(selected)] : undefined;
  const scls = sq ? quoteClass(sq) : 'flat';

  const onRefresh = () => {
    void load();
    void refresh();
  };

  // 默认选中：加载完成后若无有效选中（首次进入/选中项被删），选中当前筛选第一个，
  // 图表区与信息条立即可见（三栏终端体验：进来就能看图，无需先点行）
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

      {/* 中栏：股票列表（名称 + 代码，点行切换图表股票） */}
      <div className="stock-col">
        {!loading && visible.length === 0 ? (
          <p className="empty">暂无自选，点 ＋ 添加</p>
        ) : (
          <ul className="stock-list" aria-label="自选股列表">
            {visible.map((s) => (
              <li
                key={s.id}
                className={`stock-item${selected === s.symbol ? ' selected' : ''}`}
                aria-current={selected === s.symbol ? 'true' : undefined}
                onClick={() => onSelect?.(s.symbol)}
                data-testid={`row-${s.symbol}`}
              >
                <span className="si-text">
                  <span className="si-name">{s.name || s.symbol}</span>
                  <span className="si-code">{s.symbol}</span>
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
            ))}
          </ul>
        )}
      </div>

      {/* 右主区：导航栏 + 选中股票信息条 + 图表区 */}
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

        {selected ? (
          <div className="quote-bar" data-testid="quote-bar">
            <span className="qb-seg">
              <span className="qb-label">股票代码</span>
              <span className="qb-value">{selected}</span>
            </span>
            <span className="qb-seg">
              <span className="qb-label">现价</span>
              <span className={`qb-value num ${scls}`}>{sq ? sq.price.toFixed(2) : '—'}</span>
            </span>
            <span className="qb-seg">
              <span className="qb-label">涨跌幅</span>
              <span className={`qb-value num ${scls}`}>
                {sq ? `${pctText(sq.changePct)} ${sq.change >= 0 ? '▲' : '▼'}` : '—'}
              </span>
            </span>
          </div>
        ) : (
          !loading && <p className="empty">添加自选后，这里显示分时与K线</p>
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
