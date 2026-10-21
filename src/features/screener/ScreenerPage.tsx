// 模块④ 条件选股页（2026-10-21 从自选页拆出，成为独立 Tab）
//
// 复用既有引擎：useScreener（两段式日K→分钟K）+ ScreenerPanel（条件开关）+ ScreenerResults（结果表）。
// 范围两档：自选股（默认，进入即自动跑一轮）/ 沪深A股（手动开扫，5000+ 只）。
// 与自选页的分工：自选页只管列表与图表，选股是独立工作面，互不挤占右侧图表区。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWatchlist } from '../watchlist/useWatchlist';
import { useMarketRoster } from './useMarketRoster';
import { useScreener, type ScreenerOptions } from './useScreener';
import { ScreenerPanel, type ScreenerScope } from './ScreenerPanel';
import { ScreenerResults } from './ScreenerResults';
import type { StockRepository } from '../../lib/repository';
import type { Stock } from '../../lib/types';
import { bareSymbol } from '../../lib/symbol';

interface Props {
  repo: StockRepository;
  onOpenStock?: (symbol: string) => void;
}

export function ScreenerPage({ repo, onOpenStock }: Props) {
  const { stocks, add, error } = useWatchlist(repo);
  const [scope, setScope] = useState<ScreenerScope>('watchlist');

  // 市场模式名单：仅切到「沪深A股」才拉取，按天缓存
  const roster = useMarketRoster(scope === 'market');
  const source = scope === 'market' ? roster.stocks : stocks;
  const opts = useMemo<ScreenerOptions>(
    () => (scope === 'market' ? { bars: 60, concurrency: 8, scanHost: true } : {}),
    [scope]
  );
  const ctl = useScreener(source, opts);
  const autoRan = useRef(false);

  // 自选范围进入即自动筛一轮（每次进入只跑一次；换范围/改条件后手动点开始）
  useEffect(() => {
    if (scope !== 'watchlist') {
      autoRan.current = false;
      return;
    }
    if (autoRan.current || ctl.running || ctl.rows.length > 0) return;
    if (stocks.length === 0) return;
    autoRan.current = true;
    void ctl.run();
  }, [scope, ctl, stocks.length]);

  const switchScope = (next: ScreenerScope) => {
    setScope(next);
    ctl.reset();
  };

  const watchGroups = useMemo(
    () => Object.fromEntries(stocks.map((s) => [bareSymbol(s.symbol), s.group])),
    [stocks]
  );

  // 结果行内的现价由列表自带（ScreenRow 不存报价），这里只用于结果表排序展示，不做额外请求

  const rosterLine =
    roster.stocks.length > 0
      ? `沪深A股 ${roster.stocks.length.toLocaleString('zh-CN')} 只 · ${(roster.date ?? '').slice(5)} 更新（${
          roster.source === 'eastmoney' ? '东财' : '腾讯枚举'
        }）`
      : null;

  return (
    <div className="screen-page" data-testid="screener-page">
      <header className="wb-page-head">
        <h2>条件选股</h2>
        <span className="mk-muted">
          {scope === 'market' ? '全市场扫描按需手动发起' : '自选股进入即自动筛选一轮'}
        </span>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="screen-grid">
        <ScreenerPanel
          toggles={ctl.toggles}
          onToggle={ctl.toggle}
          onRun={() => void ctl.run()}
          running={ctl.running}
          progress={ctl.progress}
          total={source.length}
          scope={scope}
          onScopeChange={switchScope}
          rosterLine={rosterLine}
          rosterLoading={roster.loading}
          rosterError={roster.error}
          rosterNote={roster.note}
          onRosterRefresh={roster.refresh}
          onCancel={ctl.cancel}
          emptyHint={scope === 'market' ? '暂无可用名单，请刷新重试' : undefined}
          priceRange={ctl.priceRange}
          onPriceRangeChange={ctl.setPriceRange}
        />

        <div className="screen-results-panel">
          <ScreenerResults
            rows={ctl.rows}
            onView={(symbol) => onOpenStock?.(symbol)}
            mode={scope}
            scanned={ctl.scanned}
            running={ctl.running}
            emptyHint={
              scope === 'market'
                ? '点「开始筛选」扫描沪深A股（约 1–3 分钟，可随时停止）'
                : stocks.length === 0
                  ? '先在「自选」里添加股票，或切到「沪深A股」全市场扫描'
                  : undefined
            }
            onAdd={
              scope === 'market'
                ? async (stock: Stock, group: string) => {
                    await add({ symbol: stock.symbol, name: stock.name, group });
                  }
                : undefined
            }
            watchGroups={scope === 'market' ? watchGroups : undefined}
          />
        </div>
      </div>
    </div>
  );
}
