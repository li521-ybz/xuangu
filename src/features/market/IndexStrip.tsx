// 模块① 看盘总览 · 指数条：五大指数点位与涨跌（红涨绿跌）
import type { IndexQuote } from '../../lib/types';
import { changeText, pctText, trendOf } from '../../lib/format';

interface Props {
  list: IndexQuote[];
  labels: Array<{ symbol: string; label: string }>;
}

export function IndexStrip({ list, labels }: Props) {
  // 上游未返回时用占位，避免布局跳动
  return (
    <div className="mk-index-strip" data-testid="index-strip">
      {labels.map(({ symbol, label }) => {
        const q = list.find((i) => i.symbol === symbol || i.symbol.endsWith(symbol.slice(-6)));
        const cls = q ? trendOf(q.change) : 'flat';
        return (
          <div className="mk-index" key={symbol} data-testid={`index-${symbol}`}>
            <span className="mk-index-name">{q?.name || label}</span>
            <span className={`mk-index-price num ${cls}`}>
              {q ? q.price.toFixed(2) : '—'}
            </span>
            <span className={`mk-index-pct num ${cls}`}>
              {q ? `${changeText(q.change)}  ${pctText(q.changePct)}` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
