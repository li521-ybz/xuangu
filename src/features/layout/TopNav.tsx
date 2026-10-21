// 顶部模块导航：六模块切换 + 品牌 + 设置入口
// 窄屏横向滚动（不换行），保证手机上六个 Tab 都能点到。
export type TabKey = 'market' | 'watch' | 'hold' | 'screen' | 'sim' | 'backtest';

export const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'market', label: '看盘' },
  { key: 'watch', label: '自选' },
  { key: 'hold', label: '持仓' },
  { key: 'screen', label: '选股' },
  { key: 'sim', label: '模拟盘' },
  { key: 'backtest', label: '回测' }
];

interface Props {
  tab: TabKey;
  onChange: (tab: TabKey) => void;
  onOpenSettings?: () => void;
}

export function TopNav({ tab, onChange, onOpenSettings }: Props) {
  return (
    <header className="wb-topbar">
      <div className="wb-brand">
        <span className="wb-brand-mark" aria-hidden="true" />
        <h1 className="wb-brand-title">股票看盘工作台</h1>
      </div>

      <nav className="wb-tabs" role="tablist" aria-label="模块导航">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`wb-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => onChange(t.key)}
            data-testid={`tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="wb-topbar-tools">
        {onOpenSettings && (
          <button type="button" className="tool-btn" aria-label="设置" title="设置" onClick={onOpenSettings}>
            ⚙
          </button>
        )}
      </div>
    </header>
  );
}
