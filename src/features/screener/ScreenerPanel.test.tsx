// 模块④ 条件面板组件测试：开关/运行/进度/空态
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreenerPanel } from './ScreenerPanel';
import { DEFAULT_TOGGLES } from './conditions';
import type { PriceRange } from './useScreener';

describe('ScreenerPanel 条件面板', () => {
  it('渲染 1 剔除 + 1 价格限制 + 4 主条件 + 3 买点开关；除价格限制外默认全开', () => {
    render(
      <ScreenerPanel toggles={DEFAULT_TOGGLES} onToggle={() => {}} onRun={() => {}} running={false} progress="" total={3} />
    );
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(9);
    // 价格限制默认关（不改变现有筛选行为，用户开启后填值生效），其余默认开
    expect(screen.getByRole('switch', { name: '限定价格区间' })).toHaveAttribute('aria-checked', 'false');
    switches
      .filter((s) => s.getAttribute('aria-label') !== '限定价格区间')
      .forEach((s) => expect(s).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('button', { name: '开始筛选' })).toBeInTheDocument();
  });

  it('价格限制：默认关不显示输入；点开关回调 priceLimit', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ScreenerPanel toggles={DEFAULT_TOGGLES} onToggle={onToggle} onRun={() => {}} running={false} progress="" total={3} />
    );
    expect(screen.queryByRole('spinbutton', { name: '最低价' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: '限定价格区间' }));
    expect(onToggle).toHaveBeenCalledWith('priceLimit');
  });

  it('价格限制：开启后最低/最高输入可填可清（值经 parsePrice 解析，清空=不限）', async () => {
    const user = userEvent.setup();
    // 有状态夹具：价格区间存在 useScreener，面板受控；mock 回调不更新 state 会被 React 重置值
    function Harness() {
      const [range, setRange] = useState<PriceRange>({ min: null, max: null });
      return (
        <ScreenerPanel
          toggles={{ ...DEFAULT_TOGGLES, priceLimit: true }}
          onToggle={() => {}}
          onRun={() => {}}
          running={false}
          progress=""
          total={3}
          priceRange={range}
          onPriceRangeChange={setRange}
        />
      );
    }
    render(<Harness />);
    const min = screen.getByRole('spinbutton', { name: '最低价' }) as HTMLInputElement;
    const max = screen.getByRole('spinbutton', { name: '最高价' }) as HTMLInputElement;
    await user.type(min, '5');
    expect(min.value).toBe('5');
    await user.type(max, '50');
    expect(max.value).toBe('50');
    await user.clear(max);
    expect(max.value).toBe(''); // 清空 → null → 该端不限
  });

  it('剔除 ST 开关：默认开，点击回调 excludeSt', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ScreenerPanel toggles={DEFAULT_TOGGLES} onToggle={onToggle} onRun={() => {}} running={false} progress="" total={3} />
    );
    const sw = screen.getByRole('switch', { name: 'ST 股票' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await user.click(sw);
    expect(onToggle).toHaveBeenCalledWith('excludeSt');
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

describe('ScreenerPanel 市场模式（2026-10-18）', () => {
  const base = {
    toggles: DEFAULT_TOGGLES,
    onToggle: () => {},
    onRun: () => {},
    running: false,
    progress: '',
    total: 4912
  };

  it('范围分段：切换自选股/沪深A股', async () => {
    const user = userEvent.setup();
    const onScopeChange = vi.fn();
    render(<ScreenerPanel {...base} onScopeChange={onScopeChange} />);
    await user.click(screen.getByRole('button', { name: '沪深A股' }));
    expect(onScopeChange).toHaveBeenCalledWith('market');
    await user.click(screen.getByRole('button', { name: '自选股' }));
    expect(onScopeChange).toHaveBeenCalledWith('watchlist');
  });

  it('名单加载中：禁用开始筛选', async () => {
    render(<ScreenerPanel {...base} scope="market" rosterLoading total={0} />);
    expect(screen.getByRole('button', { name: '开始筛选' })).toBeDisabled();
    expect(screen.getByTestId('roster-line')).toHaveTextContent('名单加载中');
  });

  it('名单就绪：状态行含只数/来源，可刷新', async () => {
    const user = userEvent.setup();
    const onRosterRefresh = vi.fn();
    render(
      <ScreenerPanel
        {...base}
        scope="market"
        rosterLine="沪深A股 4,912 只 · 10-19 更新（东财）"
        onRosterRefresh={onRosterRefresh}
      />
    );
    expect(screen.getByTestId('roster-line')).toHaveTextContent('4,912 只');
    expect(screen.getByTestId('roster-line')).toHaveTextContent('东财');
    await user.click(screen.getByRole('button', { name: '刷新名单' }));
    expect(onRosterRefresh).toHaveBeenCalled();
  });

  it('名单失败：显示错误与重试', async () => {
    const user = userEvent.setup();
    const onRosterRefresh = vi.fn();
    render(
      <ScreenerPanel
        {...base}
        scope="market"
        total={0}
        rosterError="名单获取失败：网络不通"
        onRosterRefresh={onRosterRefresh}
      />
    );
    expect(screen.getByText('名单获取失败：网络不通')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(onRosterRefresh).toHaveBeenCalled();
  });

  it('运行中：显示停止按钮（开始按钮保持禁用）', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ScreenerPanel {...base} running progress="拉取日K 120/4912 · 约剩 1 分钟" onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: '停止' }));
    expect(onCancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '筛选中…' })).toBeDisabled();
  });
});
