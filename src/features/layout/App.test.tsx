// 阶段4 集成：一页式仪表盘（2026-10-17 起）——表格 + 图表同屏，默认选中第一个
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('App 集成', () => {
  it('添加并选中个股：表格 + 图表 同屏（一页式）', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));

    const row = await screen.findByTestId('row-sh600000');
    await user.click(row); // 点击行切换图表股票

    // 图表（日K + 30分 + 60分）出现
    expect(await screen.findByTestId('day-chart')).toBeInTheDocument();
    expect(screen.getByTestId('m30-chart')).toBeInTheDocument();
    expect(screen.getByTestId('m60-chart')).toBeInTheDocument();
    // 列表仍在（同一页）
    expect(screen.getByTestId('row-sh600000')).toBeInTheDocument();
  });

  it('添加后默认选中第一只：图表区无需点行直接可见', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));

    // 默认选中逻辑：加载完即选中当前筛选第一个，进来就能看图
    expect(await screen.findByTestId('day-chart')).toBeInTheDocument();
    expect(screen.getByTestId('m30-chart')).toBeInTheDocument();
    expect(screen.getByTestId('m60-chart')).toBeInTheDocument();
  });
});
