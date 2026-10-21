// 模块② 自选：三栏终端布局（左分组导航 / 中股票列表 / 右信息条+图表）
//
// 2026-10-21 拆分：条件选股（模块④）从本页迁出为独立 Tab，本页只管自选列表与图表，
// 左栏不再有「条件选股」入口（避免两个入口指向同一功能）。
// 宽屏三栏并排；窄屏纵向堆叠（分组横排 chips → 列表 → 主区）。
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
  children?: ReactNode; // 图表区插槽：App 组合注入 <ChartPage>
}

const ALL = '全部';
/** 两大主分组：观察 ↔ 持仓 支持一键互转 */
const MAIN_GROUPS = ['观察', '持仓'];
function moveTarget(group: string): string {
  return group === '持仓' ? '观察' : '持仓';
}

export function WatchlistPage({ repo, selected, onSelect, onOpenSettings, children }: Props) {
  const { stocks, loading, error, load, add, remove, setGroup } = useWatchlist(repo);
  const [filter, setFilter] = useState<string>(ALL);
  const [adding, setAdding] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const symbols = useMemo(() => stocks.map((s) => s.symbol), [stocks]);
  const { quotes, degraded, refresh } = useQuotes(symbols);
  // 选中股票不在自选里时（从看盘排行榜跳转过来）补查一次报价
  const extraSelected = useMemo(
    () => (selected && !symbols.includes(selected) ? [selected] : []),
    [selected, symbols]
  );
  const { quotes: extraQuotes } = useQuotes(extraSelected);

  const handleMove = async (id: string, group: string) => {
    const stock = stocks.find((s) => s.id === id);
    setMovingId(null);
    try {
      await setGroup(id, group);
      setToast(`已将「${stock?.name || stock?.symbol || '该股'}」转移到${group}`);
    } catch {
      // 失败原因由 useWatchlist 写入页面错误横幅
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const groups = useMemo(() => groupsOf(stocks), [stocks]);
  const visible = useMemo(
    () => (filter === ALL ? stocks : stocks.filter((s) => s.group === filter)),
    [stocks, filter]
  );

  const sq = selected ? quotes[bareSymbol(selected)] ?? extraQuotes[bareSymbol(selected)] : undefined;
  const scls = sq ? quoteClass(sq) : 'flat';

  const onRefresh = () => {
    void load();
    void refresh();
  };

  // 默认选中：加载完若无有效选中，选中当前筛选第一个，进来就能看图
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
                onClick={() => {
                  setMovingId(null);
                  onSelect?.(s.symbol);
                }}
                data-testid={`row-${s.symbol}`}
              >
                <span className="si-text">
                  <span className="si-name">{s.name || s.symbol}</span>
                  <span className="si-code">{s.symbol}</span>
                </span>
                {movingId === s.id ? (
                  <span className="row-add-menu" data-testid={`move-menu-${s.symbol}`}>
                    {groups
                      .filter((g) => g !== s.group)
                      .map((g) => (
                        <button
                          key={g}
                          type="button"
                          className="grp-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleMove(s.id, g);
                          }}
                        >
                          {g}
                        </button>
                      ))}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="row-move"
                    aria-label={`转移 ${s.name || s.symbol} 到${
                      MAIN_GROUPS.includes(s.group) ? moveTarget(s.group) : '其他分组'
                    }`}
                    title={MAIN_GROUPS.includes(s.group) ? `一键转移到${moveTarget(s.group)}` : '转移分组'}
                    data-testid={`move-${s.symbol}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (MAIN_GROUPS.includes(s.group)) {
                        void handleMove(s.id, moveTarget(s.group));
                      } else {
                        setMovingId(s.id);
                      }
                    }}
                  >
                    ⇄
                  </button>
                )}
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

      {/* 右主区：标题条 + 信息条 + 图表区 */}
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
            <button
              className="tool-btn tool-btn-primary"
              aria-label="添加自选"
              title="添加自选"
              onClick={() => setAdding(true)}
            >
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

      {toast && (
        <div className="move-toast" role="status" data-testid="move-toast">
          {toast}
        </div>
      )}
    </section>
  );
}
