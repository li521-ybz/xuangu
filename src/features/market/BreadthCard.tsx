// 模块① 看盘总览 · 市场宽度：涨跌家数、涨跌停、成交额、主力净流入 + 涨跌分布
import type { Breadth, MarketRow } from '../../lib/types';
import { moneyText } from '../../lib/analytics';

interface Props {
  breadth: Breadth;
  rows: MarketRow[];
  source: 'eastmoney' | 'tencent';
}

/** 涨跌分布分桶（%）：<=-7 / -7~-5 / -5~-3 / -3~0 / 0 / 0~3 / 3~5 / 5~7 / >=7 */
const BUCKETS: Array<{ label: string; test: (p: number) => boolean }> = [
  { label: '≤-7', test: (p) => p <= -7 },
  { label: '-7~-5', test: (p) => p > -7 && p <= -5 },
  { label: '-5~-3', test: (p) => p > -5 && p <= -3 },
  { label: '-3~0', test: (p) => p > -3 && p < 0 },
  { label: '0', test: (p) => p === 0 },
  { label: '0~3', test: (p) => p > 0 && p < 3 },
  { label: '3~5', test: (p) => p >= 3 && p < 5 },
  { label: '5~7', test: (p) => p >= 5 && p < 7 },
  { label: '≥7', test: (p) => p >= 7 }
];

export function BreadthCard({ breadth, rows, source }: Props) {
  const { up, down, flat, limitUp, limitDown, amount, mainInflow, total } = breadth;
  const traded = up + down + flat;
  const upPct = traded > 0 ? (up / traded) * 100 : 0;
  const flatPct = traded > 0 ? (flat / traded) * 100 : 0;

  const counts = BUCKETS.map((b) => rows.filter((r) => b.test(r.changePct)).length);
  const maxCount = Math.max(1, ...counts);

  return (
    <section className="mk-card" aria-label="市场宽度">
      <header className="mk-card-head">
        <h3>市场宽度</h3>
        <span className="mk-muted">共 {total.toLocaleString('zh-CN')} 只</span>
      </header>

      {/* 涨跌比例条：红涨 / 灰平 / 绿跌 */}
      <div className="mk-breadth-bar" role="img" aria-label={`上涨 ${up} 家，平盘 ${flat} 家，下跌 ${down} 家`}>
        <span className="seg up" style={{ width: `${upPct}%` }} />
        <span className="seg flat" style={{ width: `${flatPct}%` }} />
        <span className="seg down" style={{ width: `${Math.max(0, 100 - upPct - flatPct)}%` }} />
      </div>

      <div className="mk-breadth-nums">
        <div className="mk-num-item">
          <span className="k">上涨</span>
          <span className="v num up">{up.toLocaleString('zh-CN')}</span>
        </div>
        <div className="mk-num-item">
          <span className="k">平盘</span>
          <span className="v num flat">{flat.toLocaleString('zh-CN')}</span>
        </div>
        <div className="mk-num-item">
          <span className="k">下跌</span>
          <span className="v num down">{down.toLocaleString('zh-CN')}</span>
        </div>
      </div>

      <div className="mk-metric-grid">
        <div className="mk-metric">
          <span className="k">涨停</span>
          <span className="v num up">{limitUp}</span>
        </div>
        <div className="mk-metric">
          <span className="k">跌停</span>
          <span className="v num down">{limitDown}</span>
        </div>
        <div className="mk-metric">
          <span className="k">成交额</span>
          <span className="v num">{moneyText(amount)}</span>
        </div>
        <div className="mk-metric">
          <span className="k">主力净流入</span>
          <span
            className={`v num ${
              mainInflow === undefined ? 'flat' : mainInflow >= 0 ? 'up' : 'down'
            }`}
          >
            {mainInflow === undefined ? '—' : `${mainInflow >= 0 ? '+' : ''}${moneyText(mainInflow)}`}
          </span>
        </div>
      </div>

      {/* 涨跌分布柱状图：纯 CSS，绿→灰→红 */}
      <div className="mk-dist" aria-label="涨跌幅分布">
        {BUCKETS.map((b, i) => {
          const c = counts[i];
          return (
            <div className="mk-dist-col" key={b.label} title={`${b.label}%：${c} 只`}>
              <span className="mk-dist-count num">{c}</span>
              <span
                className={`mk-dist-bar ${b.label.startsWith('-') || b.label.startsWith('≤') ? 'down' : b.label === '0' ? 'flat' : 'up'}`}
                style={{ height: `${Math.max(2, (c / maxCount) * 100)}%` }}
              />
              <span className="mk-dist-label">{b.label}</span>
            </div>
          );
        })}
      </div>

      <footer className="mk-card-foot">
        数据源：{source === 'eastmoney' ? '东方财富' : '腾讯行情（主力资金不可用）'}
      </footer>
    </section>
  );
}
