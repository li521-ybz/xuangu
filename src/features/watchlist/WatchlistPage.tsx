// 模块① 自选看板页：三栏终端布局（2026-10-17 起，按用户手绘图）
// 宽屏：左竖排分组导航 + 中股票列表列 + 右主区「信息条 → 图表（children 注入模块③）」
// 窄屏：纵向堆叠（分组横排 chips → 列表 → 主区）
// 列表行显示名称+代码（用户 2026-10-17 拍板）；信息条只显示当前选中股票的 代码/现价/涨跌幅
// 模块④ 条件选股（2026-10-17）：左栏底部「条件选股」入口，进入后中栏变条件面板、右栏变结果列表。
// 2026-10-18 选股范围扩大到沪深A股：中栏顶部「自选股/沪深A股」分段，市场模式扫东财+腾讯枚举名单
// （不含北交所，用户 2026-10-18 拍板），手动开扫、进度带预计剩余、可停止。
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StockRepository } from '../../lib/repository';
import { bareSymbol } from '../../lib/symbol';
import { groupsOf, useWatchlist } from './useWatchlist';
import { AddStockModal } from './AddStockModal';
import { useQuotes } from '../quotes/useQuotes';
import { ScreenerPanel, type ScreenerScope } from '../screener/ScreenerPanel';
import { ScreenerResults } from '../screener/ScreenerResults';
import { useScreener, type ScreenerOptions } from '../screener/useScreener';
import { useMarketRoster } from '../screener/useMarketRoster';
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
  const [screener, setScreener] = useState(false);
  const [scope, setScope] = useState<ScreenerScope>('watchlist');
  // 市场模式名单：仅切到「沪深A股」才拉取（active），缓存按天失效
  const roster = useMarketRoster(screener && scope === 'market');
  const screenerStocks = scope === 'market' ? roster.stocks : stocks;
  const screenerOpts = useMemo<ScreenerOptions>(
    () => (scope === 'market' ? { bars: 60, concurrency: 8, scanHost: true } : {}),
    [scope]
  );
  const screenerCtl = useScreener(screenerStocks, screenerOpts);
  const autoRan = useRef(false);

  const symbols = useMemo(() => stocks.map((s) => s.symbol), [stocks]);
  const { quotes, degraded, refresh } = useQuotes(symbols);
  // 选中股票不在自选股里时（如全市场扫描结果行），单独补查一次报价，信息条不显示「—」
  const extraSelected = useMemo(
    () => (selected && !symbols.includes(selected) ? [selected] : []),
    [selected, symbols]
  );
  const { quotes: extraQuotes } = useQuotes(extraSelected);

  const groups = useMemo(() => groupsOf(stocks), [stocks]);
  const visible = useMemo(
    () => (filter === ALL ? stocks : stocks.filter((s) => s.group === filter)),
    [stocks, filter]
  );

  // 选中股票的实时行情（信息条用；与列表同源，不重复请求）
  const sq = selected
    ? quotes[bareSymbol(selected)] ?? extraQuotes[bareSymbol(selected)]
    : undefined;
  const scls = sq ? quoteClass(sq) : 'flat';

  const onRefresh = () => {
    void load();
    void refresh();
  };

  // 切换选股范围：清空上一轮结果，避免两种范围的行混在一起
  const switchScope = (next: ScreenerScope) => {
    setScope(next);
    screenerCtl.reset();
  };

  const rosterLine =
    roster.stocks.length > 0
      ? `沪深A股 ${roster.stocks.length.toLocaleString('zh-CN')} 只 · ${(roster.date ?? '').slice(5)} 更新（${
          roster.source === 'eastmoney' ? '东财' : '腾讯枚举'
        }）`
      : null;

  // 默认选中：加载完成后若无有效选中（首次进入/选中项被删），选中当前筛选第一个，
  // 图表区与信息条立即可见（三栏终端体验：进来就能看图，无需先点行）。
  // 选股模式下不自动选中（右栏被结果列表占用）。
  useEffect(() => {
    if (loading || screener) return;
    const exists = !!selected && stocks.some((s) => s.symbol === selected);
    if (!exists && visible[0]) onSelect?.(visible[0].symbol);
  }, [loading, screener, selected, stocks, visible, onSelect]);

  // 进入选股模式且自选非空时自动筛一次（每次进入只跑一轮；改条件/加股票后手动点「开始筛选」）。
  // 市场模式（沪深A股）不自动跑：5000 只一轮几十 MB 流量，必须用户手动发起。
  useEffect(() => {
    if (!screener || scope !== 'watchlist') {
      autoRan.current = false;
      return;
    }
    if (autoRan.current || screenerCtl.running || screenerCtl.rows.length > 0) return;
    if (stocks.length === 0) return;
    autoRan.current = true;
    void screenerCtl.run();
  }, [screener, scope, screenerCtl, stocks.length]);

  return (
    <section className="watchlist" aria-label="自选股看板">
      <nav className="group-side" aria-label="分组筛选">
        {[ALL, ...groups].map((g) => (
          <button
            key={g}
            type="button"
            className={!screener && g === filter ? 'tab active' : 'tab'}
            aria-pressed={!screener && g === filter}
            onClick={() => {
              setFilter(g);
              setScreener(false);
            }}
          >
            {g}
          </button>
        ))}
        <button
          type="button"
          className={`tab tab-screener${screener ? ' active' : ''}`}
          aria-label="条件选股"
          aria-pressed={screener}
          data-testid="screener-entry"
          onClick={() => setScreener((v) => !v)}
        >
          条件选股
        </button>
      </nav>

      {/* 中栏：股票列表（名称 + 代码，点行切换图表股票）；选股模式下为条件面板 */}
      <div className="stock-col">
        {screener ? (
          <ScreenerPanel
            toggles={screenerCtl.toggles}
            onToggle={screenerCtl.toggle}
            onRun={() => void screenerCtl.run()}
            running={screenerCtl.running}
            progress={screenerCtl.progress}
            total={screenerStocks.length}
            scope={scope}
            onScopeChange={switchScope}
            rosterLine={rosterLine}
            rosterLoading={roster.loading}
            rosterError={roster.error}
            rosterNote={roster.note}
            onRosterRefresh={roster.refresh}
            onCancel={screenerCtl.cancel}
            emptyHint={scope === 'market' ? '暂无可用名单，请刷新重试' : undefined}
          />
        ) : !loading && visible.length === 0 ? (
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

      {/* 右主区：导航栏 + 信息条 + 图表区；选股模式下为结果列表 */}
      <div className="board-main">
        <header className="navbar">
          <h2 className="navbar-title">{screener ? '条件选股' : '自选股'}</h2>
          <div className="navbar-tools">
            {!screener && (
              <>
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
              </>
            )}
          </div>
        </header>

        {error && <p className="error">{error}</p>}
        {loading && <p className="loading">加载中…</p>}
        {degraded && <p className="error">行情部分降级（沿用上次数据）</p>}

        {screener ? (
          <ScreenerResults
            rows={screenerCtl.rows}
            onView={(symbol) => {
              onSelect?.(symbol);
              setScreener(false);
            }}
            mode={scope}
            scanned={screenerCtl.scanned}
            running={screenerCtl.running}
            emptyHint={
              scope === 'market' ? '点「开始筛选」扫描沪深A股（约 1–3 分钟，可随时停止）' : undefined
            }
          />
        ) : (
          <>
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
          </>
        )}
      </div>
    </section>
  );
}
