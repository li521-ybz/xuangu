// 阶段3 图表区：日K(上) + 30分/60分(下，两张图同时常显)
// 2026-10-17 一页式仪表盘合并后：本组件只负责图表（头部价格卡已移除，
// 价格/涨跌幅改由看板页三列表格按行展示）；由 App 作为 children 注入看板页右栏。
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ChartPage } from './ChartPage';

describe('ChartPage', () => {
  it('同屏展示日K、30分、60分三块', () => {
    render(<ChartPage symbol="sh600000" />);
    expect(screen.getByTestId('day-chart')).toBeInTheDocument();
    expect(screen.getByTestId('m30-chart')).toBeInTheDocument();
    expect(screen.getByTestId('m60-chart')).toBeInTheDocument();
  });

  it('日K标题标注当前股票代码', () => {
    render(<ChartPage symbol="sh600000" />);
    expect(within(screen.getByTestId('day-chart')).getByText('sh600000')).toBeInTheDocument();
  });

  it('30分与60分两块均标注当前股票代码', () => {
    render(<ChartPage symbol="sh600000" />);
    expect(within(screen.getByTestId('m30-chart')).getByText('sh600000')).toBeInTheDocument();
    expect(within(screen.getByTestId('m60-chart')).getByText('sh600000')).toBeInTheDocument();
  });
});
