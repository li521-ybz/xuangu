// 应用外壳：宽屏双栏（左列表 + 右详情）/ 手机单栏（点行进详情）
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
        onSelect={setSelected}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {selected && <ChartPage symbol={selected} />}
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
