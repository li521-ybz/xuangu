// 模块④ 筛选结果（右栏）：主条件通过者全部列出，徽章区分「买点已到 / 买点未到 / 数据缺失」
// 排序：买点已到 → 候选 → 数据缺失（useScreener 已排）；点行回到该股图表。
import type { ScreenRow } from './useScreener';

interface Props {
  rows: ScreenRow[];
  onView: (symbol: string) => void;
}

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

export function ScreenerResults({ rows, onView }: Props) {
  const hit = rows.filter((r) => r.status === 'hit').length;
  const cand = rows.filter((r) => r.status === 'candidate').length;
  const miss = rows.filter((r) => r.status === 'no-data').length;

  return (
    <div className="screener-results" data-testid="screener-results">
      {rows.length === 0 ? (
        <p className="empty">设置条件后点「开始筛选」</p>
      ) : (
        <>
          <p className="result-summary" data-testid="result-summary">
            买点已到 {hit} 只 · 买点未到 {cand} 只 · 数据缺失 {miss} 只
          </p>
          <ul className="stock-list" aria-label="选股结果列表">
            {rows.map((r) => (
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
          </ul>
        </>
      )}
    </div>
  );
}
