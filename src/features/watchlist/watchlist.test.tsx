// 阶段1 看板页组件测试
import { describe, it, expect } from 'vitest';
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

  it('添加自选股并展示', async () => {
    const user = userEvent.setup();
    render(<WatchlistPage repo={new InMemoryStockRepository()} />);
    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.type(screen.getByLabelText('股票名称'), '浦发银行');
    await user.click(screen.getByRole('button', { name: '添加' }));
    // 一页式仪表盘：首列严格只显示股票代码（用户 2026-10-17 拍板），名称不入列表行
    expect(await screen.findByText('sh600000')).toBeInTheDocument();
    expect(screen.queryByText('浦发银行')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-sh600000')).toBeInTheDocument();
  });

  it('表格三列表头：股票代码/现价/涨跌幅', async () => {
    const user = userEvent.setup();
    render(<WatchlistPage repo={new InMemoryStockRepository()} />);
    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));
    expect(await screen.findByText('股票代码')).toBeInTheDocument();
    expect(screen.getByText('现价')).toBeInTheDocument();
    expect(screen.getByText('涨跌幅')).toBeInTheDocument();
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
