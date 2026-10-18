// 模块④ 条件面板（中栏）：主条件/买点条件开关 + 口径说明 + 开始筛选
// 参数口径固定（用户 2026-10-17 拍板「条件是这些固定的」），不在 UI 暴露调参。
import type { ConditionToggles } from './conditions';

interface Props {
  toggles: ConditionToggles;
  onToggle: (key: keyof ConditionToggles) => void;
  onRun: () => void;
  running: boolean;
  progress: string;
  total: number;
}

interface Item {
  key: keyof ConditionToggles;
  label: string;
  hint?: string;
}

const MAIN_ITEMS: Item[] = [
  { key: 'limitUpWindow', label: '涨停后 3–10 日内' },
  { key: 'shrink', label: '缩量至 55% 及以下', hint: '对比涨停日/次日最高量' },
  { key: 'notBreakLimitLow', label: '不破首板最低价', hint: '连板取第一个涨停日最低价' },
  { key: 'closeAboveMa20', label: '收盘价 > 20 日线' }
];

const BUY_ITEMS: Item[] = [
  { key: 'closeAboveMa10', label: '收盘价 > 10 日线' },
  { key: 'bollNarrow', label: '30 分 BOLL 缩口 + 13/25 买点', hint: '两分支均 30 分 BOLL(45,2) + 30 分 13/25' },
  { key: 'maCross60', label: '60 分 13/25 买点', hint: '仅 >6 日分支生效' }
];

function ToggleRow({ item, checked, onChange }: { item: Item; checked: boolean; onChange: () => void }) {
  return (
    <div className="cond-row">
      <span className="cond-text">
        <span className="cond-label">{item.label}</span>
        {item.hint && <span className="cond-hint">{item.hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={item.label}
        className={`switch${checked ? ' on' : ''}`}
        onClick={onChange}
      >
        <span className="knob" />
      </button>
    </div>
  );
}

export function ScreenerPanel({ toggles, onToggle, onRun, running, progress, total }: Props) {
  return (
    <div className="screener-panel" data-testid="screener-panel">
      <div className="cond-group">
        <h4>主条件（日K）</h4>
        {MAIN_ITEMS.map((it) => (
          <ToggleRow key={it.key} item={it} checked={toggles[it.key]} onChange={() => onToggle(it.key)} />
        ))}
      </div>
      <div className="cond-group">
        <h4>买点条件（分钟K）</h4>
        {BUY_ITEMS.map((it) => (
          <ToggleRow key={it.key} item={it} checked={toggles[it.key]} onChange={() => onToggle(it.key)} />
        ))}
        <p className="cond-hint">两分支均要求 30 分 BOLL(45,2) 缩口 + 30 分 13/25 金叉；距涨停 &gt;6 日的分支额外要求 60 分 13/25 金叉。</p>
      </div>
      <button className="run-btn" onClick={onRun} disabled={running || total === 0}>
        {running ? '筛选中…' : '开始筛选'}
      </button>
      {progress && (
        <p className="cond-progress" data-testid="screener-progress">
          {progress}
        </p>
      )}
      {total === 0 && <p className="empty">暂无自选股，先添加</p>}
    </div>
  );
}
