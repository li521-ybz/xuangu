// 模块④ 筛选结果（右栏）：主条件通过者全部列出，徽章区分「买点已到 / 买点未到 / 数据缺失」
// 排序：买点已到 → 候选 → 数据缺失（useScreener 已排）；点行回到该股图表。
// 2026-10-18 市场模式：汇总加「已扫描 N 只」；数据缺失行聚合成一条（全市场扫描会有上百条，
// 逐条列出淹没有效结果）；扫描中右栏显示进行中提示。
import type { ScreenRow } from './useScreener';
import type { ScreenerScope } from './ScreenerPanel';

interface Props {
  rows: ScreenRow[];
  onView: (symbol: string) => void;
  mode?: ScreenerScope;
  scanned?: number; // 市场模式：本轮已扫描只数
  running?: boolean;
  emptyHint?: string;
}

/** 市场模式数据缺失行最多逐条展示这么多，其余聚合成一行 */
const MISS_DETAIL_MAX = 30;

const BADGE: Record<ScreenRow['status'], string> = {
  hit: '买点已到',
  candidate: '买点未到',
  'no-data': '数据缺失'
};

function metricLine(r: ScreenRow): string {
  if (r.status === 'no-data') return r.note ?? '数据缺失';
  const m = r.main;
  if (!m) return '';
  const shrink = m.shrinkActual === null ? '—' : `${Math.round(m.shrinkActual * 100)}%`;
  const base = `距涨停 ${m.daysSinceLimitUp} 日 · 缩量 ${shrink}`;
  const why = r.buy && !r.buy.pass ? ` · ${r.buy.failReasons.join('、')}` : '';
  return base + why;
}

export function ScreenerResults({ rows, onView, mode = 'watchlist', scanned, running, emptyHint }: Props) {
  const hit = rows.filter((r) => r.status === 'hit').length;
  const cand = rows.filter((r) => r.status === 'candidate').length;
  const miss = rows.filter((r) => r.status === 'no-data').length;

  // 市场模式：缺失行只展示前 MISS_DETAIL_MAX 条，其余折叠为一条汇总
  const missRows = rows.filter((r) => r.status === 'no-data');
  const shown =
    mode === 'market' && missRows.length > MISS_DETAIL_MAX
      ? [...rows.filter((r) => r.status !== 'no-data'), ...missRows.slice(0, MISS_DETAIL_MAX)]
      : rows;
  const missHidden = missRows.length - Math.min(missRows.length, MISS_DETAIL_MAX);

  return (
    <div className="screener-results" data-testid="screener-results">
      {rows.length === 0 ? (
        running ? (
          <p className="empty">扫描进行中，进度见左侧条件面板</p>
        ) : (
          <p className="empty">{emptyHint ?? '设置条件后点「开始筛选」'}</p>
        )
      ) : (
        <>
          <p className="result-summary" data-testid="result-summary">
            买点已到 {hit} 只 · 买点未到 {cand} 只 · 数据缺失 {miss} 只
            {mode === 'market' && typeof scanned === 'number' ? ` · 已扫描 ${scanned} 只` : ''}
          </p>
          <ul className="stock-list" aria-label="选股结果列表">
            {shown.map((r) => (
              <li
                key={r.stock.id}
                className="stock-item"
                onClick={() => onView(r.stock.symbol)}
                data-testid={`screen-row-${r.stock.symbol}`}
              >
                <span className="si-text">
                  <span className="si-name">{r.stock.name || r.stock.symbol}</span>
                  <span className="si-code">{metricLine(r)}</span>
                </span>
                <span className={`result-badge ${r.status}`}>{BADGE[r.status]}</span>
              </li>
            ))}
            {missHidden > 0 && (
              <li className="stock-item stock-item-agg" data-testid="screen-miss-agg">
                <span className="si-text">
                  <span className="si-name">其余 {missHidden} 只数据缺失</span>
                  <span className="si-code">多为停牌/退市/接口拦截，可稍后重试</span>
                </span>
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
