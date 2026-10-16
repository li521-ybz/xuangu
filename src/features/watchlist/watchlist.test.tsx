// 阶段1 看板页组件测试
import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WatchlistPage } from './WatchlistPage';
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
    expect(await screen.findByText('浦发银行')).toBeInTheDocument();
    expect(screen.getByTestId('row-sh600000')).toBeInTheDocument();
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
