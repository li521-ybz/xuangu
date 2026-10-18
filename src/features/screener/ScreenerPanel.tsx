// 模块④ 条件面板（中栏）：主条件/买点条件开关 + 口径说明 + 开始筛选
// 参数口径固定（用户 2026-10-17 拍板「条件是这些固定的」），不在 UI 暴露调参。
// 2026-10-18 市场模式：顶部「选股范围」分段（自选股/沪深A股）+ 名单状态行 + 运行中「停止」。
// 2026-10-18 剔除 ST（用户要求）：独立「剔除」组开关，默认开；开则 ST 股不进扫描。
// 2026-10-18 价格限制（用户要求可自定义）：「价格限制」组开关默认关，开启后显「最低/最高」两个输入框（留空=不限）。
// 新增 props 全部可选：不传即自选股口径，旧调用行为不变。
import type { ConditionToggles } from './conditions';
import type { PriceRange } from './useScreener';

export type ScreenerScope = 'watchlist' | 'market';

interface Props {
  toggles: ConditionToggles;
  onToggle: (key: keyof ConditionToggles) => void;
  onRun: () => void;
  running: boolean;
  progress: string;
  total: number;
  scope?: ScreenerScope;
  onScopeChange?: (scope: ScreenerScope) => void;
  rosterLine?: string | null; // 市场模式名单状态行（只数/日期/来源）
  rosterLoading?: boolean; // 名单拉取中
  rosterError?: string | null; // 名单拉取失败（无缓存可用）
  rosterNote?: string | null; // 名单非致命提示（如沿用旧缓存）
  onRosterRefresh?: () => void; // 刷新/重试名单
  onCancel?: () => void; // 停止本轮扫描
  emptyHint?: string; // total===0 时的提示文案
  priceRange?: PriceRange; // 价格限制区间（元）；不传按 { min: null, max: null } 不限处理
  onPriceRangeChange?: (next: PriceRange) => void; // 价格输入变更
}

/** 价格输入解析：空串/非有限值/负数 → null（该端不限） */
function parsePrice(v: string): number | null {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
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

// 剔除项（2026-10-18 新增）：名称含 ST 的风险警示板，默认剔除
const EXCLUDE_ITEMS: Item[] = [{ key: 'excludeSt', label: 'ST 股票', hint: '名称含 ST / *ST 的风险警示板' }];

const SCOPES: Array<{ key: ScreenerScope; label: string }> = [
  { key: 'watchlist', label: '自选股' },
  { key: 'market', label: '沪深A股' }
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

export function ScreenerPanel({
  toggles,
  onToggle,
  onRun,
  running,
  progress,
  total,
  scope = 'watchlist',
  onScopeChange,
  rosterLine,
  rosterLoading,
  rosterError,
  rosterNote,
  onRosterRefresh,
  onCancel,
  emptyHint,
  priceRange,
  onPriceRangeChange
}: Props) {
  return (
    <div className="screener-panel" data-testid="screener-panel">
      {onScopeChange && (
        <div className="scope-switch" role="group" aria-label="选股范围">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`seg${scope === s.key ? ' active' : ''}`}
              aria-pressed={scope === s.key}
              onClick={() => onScopeChange(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {scope === 'market' && (
        <div className="roster-line" data-testid="roster-line">
          {rosterLoading && <span className="cond-hint">名单加载中…</span>}
          {!rosterLoading && rosterError && (
            <span className="roster-error">
              {rosterError}
              {onRosterRefresh && (
                <button type="button" className="link-btn" onClick={onRosterRefresh}>
                  重试
                </button>
              )}
            </span>
          )}
          {!rosterLoading && !rosterError && rosterLine && (
            <span className="roster-info">
              {rosterLine}
              {onRosterRefresh && (
                <button type="button" className="link-btn" onClick={onRosterRefresh} aria-label="刷新名单">
                  ↻
                </button>
              )}
            </span>
          )}
          {rosterNote && <span className="cond-hint">{rosterNote}</span>}
        </div>
      )}

      <div className="cond-group">
        <h4>剔除</h4>
        {EXCLUDE_ITEMS.map((it) => (
          <ToggleRow key={it.key} item={it} checked={toggles[it.key]} onChange={() => onToggle(it.key)} />
        ))}
      </div>
      <div className="cond-group">
        <h4>价格限制</h4>
        <ToggleRow
          item={{ key: 'priceLimit', label: '限定价格区间', hint: '判定用最新收盘价，留空 = 不限' }}
          checked={toggles.priceLimit}
          onChange={() => onToggle('priceLimit')}
        />
        {toggles.priceLimit && onPriceRangeChange && (
          <div className="price-row">
            <label className="price-field">
              <span>最低</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="不限"
                aria-label="最低价"
                value={priceRange?.min ?? ''}
                onChange={(e) => onPriceRangeChange({ min: parsePrice(e.target.value), max: priceRange?.max ?? null })}
              />
            </label>
            <span className="price-sep">–</span>
            <label className="price-field">
              <span>最高</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="不限"
                aria-label="最高价"
                value={priceRange?.max ?? ''}
                onChange={(e) => onPriceRangeChange({ min: priceRange?.min ?? null, max: parsePrice(e.target.value) })}
              />
            </label>
            <span className="price-unit">元</span>
          </div>
        )}
      </div>
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
      <div className="run-row">
        <button
          className="run-btn"
          onClick={onRun}
          disabled={running || total === 0 || !!rosterLoading}
        >
          {running ? '筛选中…' : '开始筛选'}
        </button>
        {running && onCancel && (
          <button type="button" className="stop-btn" onClick={onCancel}>
            停止
          </button>
        )}
      </div>
      {progress && (
        <p className="cond-progress" data-testid="screener-progress">
          {progress}
        </p>
      )}
      {total === 0 && !rosterLoading && <p className="empty">{emptyHint ?? '暂无自选股，先添加'}</p>}
    </div>
  );
}
