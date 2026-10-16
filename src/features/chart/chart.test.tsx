// 阶段3 详情页：分时+日K 同屏、周期切换、红涨绿跌头部
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartPage } from './ChartPage';
import type { Quote } from '../../lib/types';

const up: Quote = { symbol: 'sh600000', name: '浦发', price: 11.2, prevClose: 11, change: 0.2, changePct: 1.818 };

describe('ChartPage', () => {
  it('同屏展示分时图与日K两块', () => {
    render(<ChartPage symbol="sh600000" />);
    expect(screen.getByTestId('intraday-chart')).toBeInTheDocument();
    expect(screen.getByTestId('kline-chart')).toBeInTheDocument();
  });

  it('周期 Tab 切换（日K/周K/月K）', async () => {
    const user = userEvent.setup();
    render(<ChartPage symbol="sh600000" />);
    const tabs = screen.getByRole('tablist', { name: 'K线周期' });
    const week = within(tabs).getByRole('tab', { name: '周K' });
    await user.click(week);
    expect(week).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('period')).toHaveTextContent('week');
  });

  it('上涨头部红', () => {
    render(<ChartPage symbol="sh600000" quote={up} />);
    const head = screen.getByText('11.20').closest('.detail-head')!;
    expect(head.className).toContain('up');
  });
});
