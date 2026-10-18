// 模块④ 条件面板组件测试：开关/运行/进度/空态
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreenerPanel } from './ScreenerPanel';
import { DEFAULT_TOGGLES } from './conditions';

describe('ScreenerPanel 条件面板', () => {
  it('渲染 4 主条件 + 3 买点开关，默认全开', () => {
    render(
      <ScreenerPanel toggles={DEFAULT_TOGGLES} onToggle={() => {}} onRun={() => {}} running={false} progress="" total={3} />
    );
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(7);
    switches.forEach((s) => expect(s).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('button', { name: '开始筛选' })).toBeInTheDocument();
  });

  it('点开关回调对应条件键', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ScreenerPanel toggles={DEFAULT_TOGGLES} onToggle={onToggle} onRun={() => {}} running={false} progress="" total={3} />
    );
    await user.click(screen.getByRole('switch', { name: '收盘价 > 20 日线' }));
    expect(onToggle).toHaveBeenCalledWith('closeAboveMa20');
  });

  it('运行中：按钮禁用并显示进度；无自选时禁用', async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    const { rerender } = render(
      <ScreenerPanel toggles={DEFAULT_TOGGLES} onToggle={() => {}} onRun={onRun} running={false} progress="" total={3} />
    );
    await user.click(screen.getByRole('button', { name: '开始筛选' }));
    expect(onRun).toHaveBeenCalledTimes(1);

    rerender(
      <ScreenerPanel toggles={DEFAULT_TOGGLES} onToggle={() => {}} onRun={onRun} running={true} progress="拉取日K 2/3" total={3} />
    );
    expect(screen.getByRole('button', { name: '筛选中…' })).toBeDisabled();
    expect(screen.getByTestId('screener-progress')).toHaveTextContent('拉取日K 2/3');

    rerender(
      <ScreenerPanel toggles={DEFAULT_TOGGLES} onToggle={() => {}} onRun={onRun} running={false} progress="" total={0} />
    );
    expect(screen.getByRole('button', { name: '开始筛选' })).toBeDisabled();
    expect(screen.getByText('暂无自选股，先添加')).toBeInTheDocument();
  });
});
