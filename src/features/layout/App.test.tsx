// 工作台外壳集成测试（2026-10-21 六模块改造后）
// 覆盖：默认进看盘总览、六 Tab 齐全且可切换、自选页表格+图表同屏、默认选中第一只。
// fetch 统一 stub 拒绝：看盘/行情/图表走降级路径，测试不依赖外网。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('App 集成', () => {
  beforeEach(() => {
    window.location.hash = '';
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('stubbed'))));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('默认进入看盘总览，六个模块 Tab 齐全', async () => {
    render(<App />);
    expect(await screen.findByTestId('market-page')).toBeInTheDocument();
    for (const key of ['market', 'watch', 'hold', 'screen', 'sim', 'backtest']) {
      expect(screen.getByTestId(`tab-${key}`)).toBeInTheDocument();
    }
    // 指数条先于全市场快照渲染
    expect(screen.getByTestId('index-strip')).toBeInTheDocument();
  });

  it('切到自选：添加并选中个股，表格 + 图表 同屏', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId('tab-watch'));
    await user.click(await screen.findByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));

    const row = await screen.findByTestId('row-sh600000');
    await user.click(row);

    expect(await screen.findByTestId('day-chart')).toBeInTheDocument();
    expect(screen.getByTestId('minute-chart')).toBeInTheDocument();
    expect(screen.getByTestId('row-sh600000')).toBeInTheDocument();
  });

  it('自选添加后默认选中第一只：图表区无需点行直接可见', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId('tab-watch'));
    await user.click(await screen.findByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));

    expect(await screen.findByTestId('day-chart')).toBeInTheDocument();
  });

  it('其余模块可切换（持仓 / 选股 / 模拟盘 / 回测）', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId('tab-hold'));
    expect(await screen.findByTestId('portfolio-page')).toBeInTheDocument();

    await user.click(screen.getByTestId('tab-screen'));
    expect(await screen.findByTestId('screener-page')).toBeInTheDocument();

    await user.click(screen.getByTestId('tab-sim'));
    expect(await screen.findByTestId('sim-page')).toBeInTheDocument();

    await user.click(screen.getByTestId('tab-backtest'));
    expect(await screen.findByTestId('backtest-page')).toBeInTheDocument();
  });
});
