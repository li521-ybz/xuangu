// 阶段2 行情单元格：红涨绿跌渲染
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuotesCell } from './QuotesCell';
import type { Quote } from '../../lib/types';

const up: Quote = { symbol: 'sh600000', name: '浦发', price: 11.2, prevClose: 11, change: 0.2, changePct: 1.818 };
const down: Quote = { symbol: 'sz000001', name: '平安', price: 9.8, prevClose: 10, change: -0.2, changePct: -2 };

describe('QuotesCell', () => {
  it('上涨：红 +▲', () => {
    render(<QuotesCell quote={up} />);
    const el = screen.getByTestId('quote');
    expect(el.className).toContain('quote-up');
    expect(el).toHaveTextContent('▲');
  });

  it('下跌：绿 ▼', () => {
    render(<QuotesCell quote={down} />);
    const el = screen.getByTestId('quote');
    expect(el.className).toContain('quote-down');
    expect(el).toHaveTextContent('▼');
  });

  it('无数据：—', () => {
    render(<QuotesCell quote={undefined} />);
    expect(screen.getByTestId('quote')).toHaveTextContent('—');
  });
});
