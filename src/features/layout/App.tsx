// 应用外壳：一页式仪表盘（2026-10-17 起，替代原宽屏双栏/手机单栏两套结构）
// WatchlistPage 内部：宽屏左侧竖排分组导航 + 右侧「股票表格 → 图表区」；窄屏纵向堆叠。
// 图表区（模块③ ChartPage）以 children 注入看板页，模块边界不互相 import。
import { useEffect, useState } from 'react';
import { WatchlistPage } from '../watchlist/WatchlistPage';
import { ChartPage } from '../chart/ChartPage';
import { SettingsModal } from '../settings/SettingsModal';
import { createStockRepository } from '../../lib/repoInstance';
import { setStoredGithubToken } from '../../lib/gistRepo';
import type { StockRepository } from '../../lib/repository';

export default function App() {
  const [selected, setSelected] = useState<string | null>(null);
  const [repo, setRepo] = useState<StockRepository>(() => createStockRepository());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const wide = useWide();

  // 录入 GitHub 令牌后，重建仓库为 Gist 实现，立即启用跨设备同步
  const applyToken = (token: string) => {
    setStoredGithubToken(token);
    setRepo(createStockRepository());
    setSettingsOpen(false);
  };

  return (
    <div className={`app ${wide ? 'wide' : 'narrow'}`}>
      <WatchlistPage
        repo={repo}
        selected={selected}
        onSelect={setSelected}
        onOpenSettings={() => setSettingsOpen(true)}
      >
        {selected && <ChartPage symbol={selected} />}
      </WatchlistPage>
      {settingsOpen && <SettingsModal onSave={applyToken} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 768px)');
    setWide(mq.matches);
    const handler = () => setWide(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return wide;
}
