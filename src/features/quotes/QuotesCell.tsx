// 模块② 行情单元格：最新价 + 涨跌幅（红涨绿跌）+ 趋势箭头
import type { Quote } from '../../lib/types';
import { changeText, pctText, quoteClass } from '../../lib/format';

interface Props {
  quote?: Quote;
}

export function QuotesCell({ quote }: Props) {
  if (!quote) {
    return (
      <span className="quote quote-empty" data-testid="quote">
        —
      </span>
    );
  }
  const cls = quoteClass(quote); // up | down | flat
  return (
    <span className={`quote quote-${cls}`} data-testid="quote" title={`涨跌额 ${changeText(quote.change)}`}>
      <span className="quote-price">{quote.price.toFixed(2)}</span>
      <span className="quote-pct">
        {pctText(quote.changePct)} {quote.change >= 0 ? '▲' : '▼'}
      </span>
    </span>
  );
}
