// 模块① 自选股看板页（阶段2 接入行情单元格 + 手动刷新）
import { useMemo, useState } from 'react';
import type { StockRepository } from '../../lib/repository';
import { bareSymbol } from '../../lib/symbol';
import { groupsOf, useWatchlist } from './useWatchlist';
import { AddStockModal } from './AddStockModal';
import { useQuotes } from '../quotes/useQuotes';
import { QuotesCell } from '../quotes/QuotesCell';

interface Props {
  repo: StockRepository;
  onSelect?: (symbol: string) => void;
  onOpenSettings?: () => void;
}

const ALL = '全部';

export function WatchlistPage({ repo, onSelect, onOpenSettings }: Props) {
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

  return (
    <section className="watchlist" aria-label="自选股看板">
      <header className="watchlist-header">
        <h2>自选股</h2>
        <div className="watchlist-tools">
          <button aria-label="刷新" onClick={onRefresh}>
            刷新
          </button>
          {onOpenSettings && (
            <button aria-label="设置" onClick={onOpenSettings}>
              ⚙
            </button>
          )}
          <button aria-label="添加自选" onClick={() => setAdding(true)}>
            ＋
          </button>
        </div>
      </header>

      <nav className="group-tabs" aria-label="分组筛选">
        {[ALL, ...groups].map((g) => (
          <button
            key={g}
            className={g === filter ? 'tab active' : 'tab'}
            aria-pressed={g === filter}
            onClick={() => setFilter(g)}
          >
            {g}
          </button>
        ))}
      </nav>

      {error && <p className="error">{error}</p>}
      {loading && <p className="loading">加载中…</p>}
      {degraded && <p className="error">行情部分降级（沿用上次数据）</p>}

      {!loading && visible.length === 0 ? (
        <p className="empty">暂无自选，点 ＋ 添加</p>
      ) : (
        <ul className="stock-list">
          {visible.map((s) => (
            <li
              key={s.id}
              className="stock-row"
              onClick={() => onSelect?.(s.symbol)}
              data-testid={`row-${s.symbol}`}
            >
              <span className="stock-name">{s.name}</span>
              <span className="stock-symbol">{s.symbol}</span>
              <QuotesCell quote={quotes[bareSymbol(s.symbol)]} />
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

      {adding && (
        <AddStockModal
          groups={groups}
          onAdd={async (input) => {
            await add(input);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}
