// 应用外壳：股票看盘工作台（2026-10-21 起，六模块单页应用）
//
// 模块：① 看盘总览 ② 自选 ③ 持仓 ④ 选股 ⑤ 模拟盘 ⑥ 策略回测
// 路由用 hash（#/market、#/watch…），GitHub Pages 静态托管刷新不 404；
// selected（当前个股）与 repo（自选仓库）提到外壳层，供跨模块联动：
// 点排行榜/选股结果 → 切到自选并选中该股看 K 线。
import { useEffect, useState } from 'react';
import { WatchlistPage } from '../watchlist/WatchlistPage';
import { ChartPage } from '../chart/ChartPage';
import { SettingsModal } from '../settings/SettingsModal';
import { MarketPage } from '../market/MarketPage';
import { PortfolioPage } from '../portfolio/PortfolioPage';
import { ScreenerPage } from '../screener/ScreenerPage';
import { SimPage } from '../sim/SimPage';
import { BacktestPage } from '../backtest/BacktestPage';
import { createStockRepository } from '../../lib/repoInstance';
import { setStoredGithubToken } from '../../lib/gistRepo';
import type { StockRepository } from '../../lib/repository';
import { TopNav, type TabKey } from './TopNav';

export default function App() {
  const [tab, setTab] = useState<TabKey>(() => readTab());
  const [selected, setSelected] = useState<string | null>(null);
  const [repo, setRepo] = useState<StockRepository>(() => createStockRepository());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const wide = useWide();

  // hash ↔ 状态双向同步（浏览器前进/后退可用）
  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (next: TabKey) => {
    setTab(next);
    if (typeof window !== 'undefined') {
      window.location.hash = `#/${next}`;
    }
  };

  /** 跨模块联动：点到某只股票 → 切到自选看图表 */
  const openStock = (symbol: string) => {
    setSelected(symbol);
    navigate('watch');
  };

  // 录入 GitHub 令牌后，重建仓库为 Gist 实现，立即启用跨设备同步
  const applyToken = (token: string) => {
    setStoredGithubToken(token);
    setRepo(createStockRepository());
    setSettingsOpen(false);
  };

  return (
    <div className={`app workbench ${wide ? 'wide' : 'narrow'}`}>
      <TopNav tab={tab} onChange={navigate} onOpenSettings={() => setSettingsOpen(true)} />

      <main className="wb-main">
        {tab === 'market' && <MarketPage onOpenStock={openStock} />}

        {tab === 'watch' && (
          <WatchlistPage
            repo={repo}
            selected={selected}
            onSelect={setSelected}
            onOpenSettings={() => setSettingsOpen(true)}
          >
            {selected && <ChartPage symbol={selected} />}
          </WatchlistPage>
        )}

        {tab === 'hold' && <PortfolioPage onOpenStock={openStock} />}
        {tab === 'screen' && <ScreenerPage repo={repo} onOpenStock={openStock} />}
        {tab === 'sim' && <SimPage onOpenStock={openStock} />}
        {tab === 'backtest' && <BacktestPage onOpenStock={openStock} />}
      </main>

      {settingsOpen && <SettingsModal onSave={applyToken} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

/** 从 hash 读取当前模块，非法值回落看盘总览 */
function readTab(): TabKey {
  if (typeof window === 'undefined') return 'market';
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  const valid: TabKey[] = ['market', 'watch', 'hold', 'screen', 'sim', 'backtest'];
  return (valid as string[]).includes(raw) ? (raw as TabKey) : 'market';
}

function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 900px)');
    setWide(mq.matches);
    const handler = () => setWide(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return wide;
}
