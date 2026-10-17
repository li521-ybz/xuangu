// 阶段3 图表区：分时+日K 同屏、周期切换
// 2026-10-17 一页式仪表盘合并后：本组件只负责图表（头部价格卡已移除，
// 价格/涨跌幅改由看板页三列表格按行展示）；由 App 作为 children 注入看板页右栏。
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartPage } from './ChartPage';

describe('ChartPage', () => {
  it('同屏展示分时图与K线两块', () => {
    render(<ChartPage symbol="sh600000" />);
    expect(screen.getByTestId('intraday-chart')).toBeInTheDocument();
    expect(screen.getByTestId('kline-chart')).toBeInTheDocument();
  });

  it('分时标题标注当前股票代码', () => {
    render(<ChartPage symbol="sh600000" />);
    expect(within(screen.getByTestId('intraday-chart')).getByText('sh600000')).toBeInTheDocument();
  });

  it('周期 Tab 切换（日K/30分/60分）', async () => {
    const user = userEvent.setup();
    render(<ChartPage symbol="sh600000" />);
    const tabs = screen.getByRole('tablist', { name: 'K线周期' });
    const m30 = within(tabs).getByRole('tab', { name: '30分' });
    await user.click(m30);
    expect(m30).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('period')).toHaveTextContent('m30');
  });
});
