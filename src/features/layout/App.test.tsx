// 阶段4 集成：选中个股后列表与详情同屏（宽屏双栏）
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('App 集成', () => {
  it('添加并选中个股：列表 + 详情 同屏（双栏）', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByLabelText('添加自选'));
    await user.type(screen.getByLabelText('股票代码'), 'sh600000');
    await user.click(screen.getByRole('button', { name: '添加' }));

    const row = await screen.findByTestId('row-sh600000');
    await user.click(row); // 点击行进入详情

    // 详情（分时+日K）出现
    expect(await screen.findByTestId('intraday-chart')).toBeInTheDocument();
    expect(screen.getByTestId('kline-chart')).toBeInTheDocument();
    // 列表仍在（双栏）
    expect(screen.getByTestId('row-sh600000')).toBeInTheDocument();
  });
});
