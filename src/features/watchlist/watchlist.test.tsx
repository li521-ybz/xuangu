// 阶段1 看板页组件测试
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WatchlistPage } from './WatchlistPage';
import type { StockRepository } from '../../lib/repository';
import { InMemoryStockRepository } from '../../lib/repository';

describe('WatchlistPage 交互', () => {
  it('空态提示', async () => {
    render(<WatchlistPage repo={new InMemoryStockRepository()} />);
    expect(await screen.findByText('暂无自选，点 ＋ 添加')).toBeInTheDocument();
  });

  it('添加自选股并展示（名称+代码两行）', async () => {
    const user = userEvent.setup();
    render(<WatchlistPage repo={new InMemoryStockRepository()} />);
    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.type(screen.getByLabelText('股票名称'), '浦发银行');
    await user.click(screen.getByRole('button', { name: '添加' }));
    // 三栏终端：中栏列表行显示名称+代码（用户 2026-10-17 拍板）
    const row = await screen.findByTestId('row-sh600000');
    expect(within(row).getByText('浦发银行')).toBeInTheDocument();
    expect(within(row).getByText('sh600000')).toBeInTheDocument();
  });

  it('选中股票信息条：股票代码/现价/涨跌幅', async () => {
    const user = userEvent.setup();
    // 选中态由 App 层持有；单测直接注入 selected（与 App 集成路径一致）
    render(<WatchlistPage repo={new InMemoryStockRepository()} selected="sh600000" />);
    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));
    // 右主区信息条出现（三段：股票代码/现价/涨跌幅）
    const bar = await screen.findByTestId('quote-bar');
    expect(within(bar).getByText('股票代码')).toBeInTheDocument();
    expect(within(bar).getByText('现价')).toBeInTheDocument();
    expect(within(bar).getByText('涨跌幅')).toBeInTheDocument();
    expect(within(bar).getByText('sh600000')).toBeInTheDocument();
  });

  it('分组筛选：切到持仓只显示该组', async () => {
    const user = userEvent.setup();
    render(<WatchlistPage repo={new InMemoryStockRepository()} />);
    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));
    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sz000001');
    await user.selectOptions(screen.getByLabelText('分组'), '持仓');
    await user.click(screen.getByRole('button', { name: '添加' }));

    expect(await screen.findByTestId('row-sh600000')).toBeInTheDocument();
    expect(screen.getByTestId('row-sz000001')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '持仓' }));
    await waitFor(() =>
      expect(screen.queryByTestId('row-sh600000')).not.toBeInTheDocument()
    );
    expect(screen.getByTestId('row-sz000001')).toBeInTheDocument();
  });

  it('添加失败时弹层显示错误且不关闭', async () => {
    const user = userEvent.setup();
    // 模拟令牌无效：Gist 写入被拒（对应线上「按钮没反应」的真实场景）
    class FailingRepo implements StockRepository {
      async list() {
        return [];
      }
      async add(): Promise<never> {
        throw new Error('创建 Gist 失败：GitHub 令牌无效或已过期（401）。请到「设置」重新粘贴有效令牌（需有 gists 权限）');
      }
      async remove() {}
      async setGroup() {}
    }
    render(<WatchlistPage repo={new FailingRepo()} />);
    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));
    // 错误原因必须可见（页面横幅 + 弹层内至少一处），且弹层保持打开
    const msgs = await screen.findAllByText(/令牌无效或已过期/);
    expect(msgs.length).toBeGreaterThan(0);
    expect(screen.getByLabelText('股票代码')).toBeInTheDocument();
    expect(screen.queryByTestId('row-sh600000')).not.toBeInTheDocument();
  });

  it('删除行后从列表消失', async () => {
    const user = userEvent.setup();
    render(<WatchlistPage repo={new InMemoryStockRepository()} />);
    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));
    const row = await screen.findByTestId('row-sh600000');
    await user.click(within(row).getByLabelText('删除 sh600000'));
    await waitFor(() =>
      expect(screen.queryByTestId('row-sh600000')).not.toBeInTheDocument()
    );
  });
});

// 模块④ 条件选股（2026-10-17）：左栏入口 → 中栏条件面板 / 右栏结果列表。
// 选股模式会自动拉取 K 线，测试统一 stub fetch 拒绝 → 走「数据缺失」路径，不依赖外网。
describe('WatchlistPage 条件选股模式', () => {
  it('左栏入口：进入后中栏变条件面板、右栏变结果；点结果行退回看板', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('stubbed'))));
    render(<WatchlistPage repo={new InMemoryStockRepository()} />);
    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));
    expect(await screen.findByTestId('row-sh600000')).toBeInTheDocument();

    await user.click(screen.getByTestId('screener-entry'));
    expect(await screen.findByTestId('screener-panel')).toBeInTheDocument();
    // 股票列表与信息条让位给条件面板/结果列表
    expect(screen.queryByTestId('row-sh600000')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quote-bar')).not.toBeInTheDocument();
    // 自动筛选一轮完成（fetch 被 stub 拒绝 → 数据缺失行）
    expect(await screen.findByTestId('screen-row-sh600000')).toBeInTheDocument();
    expect(screen.getByText('数据缺失')).toBeInTheDocument();

    await user.click(screen.getByTestId('screen-row-sh600000'));
    expect(screen.queryByTestId('screener-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-sh600000')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('条件开关可独立操作', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('stubbed'))));
    render(<WatchlistPage repo={new InMemoryStockRepository()} />);
    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));
    await user.click(screen.getByTestId('screener-entry'));
    const sw = await screen.findByRole('switch', { name: '缩量至 55% 及以下' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await user.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'false');
    vi.unstubAllGlobals();
  });

  it('无自选时选股模式：提示先添加，不触发拉取', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(() => Promise.reject(new Error('stubbed')));
    vi.stubGlobal('fetch', fetchSpy);
    render(<WatchlistPage repo={new InMemoryStockRepository()} />);
    await user.click(screen.getByTestId('screener-entry'));
    expect(await screen.findByTestId('screener-panel')).toBeInTheDocument();
    expect(screen.getByText('暂无自选股，先添加')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
