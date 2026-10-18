// 模块④ 结果列表组件测试：徽章/指标行/回调/空态
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreenerResults } from './ScreenerResults';
import type { ScreenRow } from './useScreener';
import type { Stock } from '../../lib/types';

function stock(symbol: string, name: string): Stock {
  return { id: symbol, symbol, name, group: '观察' };
}

const rows: ScreenRow[] = [
  {
    stock: stock('sh600000', '浦发银行'),
    status: 'hit',
    main: { pass: true, limitUpIndex: 20, daysSinceLimitUp: 4, shrinkActual: 0.42, failReasons: [] }
  },
  {
    stock: stock('sz000001', '平安银行'),
    status: 'candidate',
    main: { pass: true, limitUpIndex: 20, daysSinceLimitUp: 8, shrinkActual: 0.7, failReasons: [] },
    buy: { pass: false, branch: 'far', checks: { closeAboveMa10: true, bollNarrow: true, maCross: false }, failReasons: ['60 分 MA13/25 未金叉'] }
  },
  { stock: stock('sz300002', '神州泰岳'), status: 'no-data', note: '日K拉取失败：接口超时' }
];

describe('ScreenerResults 结果列表', () => {
  it('汇总 + 徽章 + 指标行（含买点未到原因）', () => {
    render(<ScreenerResults rows={rows} onView={() => {}} />);
    expect(screen.getByTestId('result-summary')).toHaveTextContent('买点已到 1 只 · 买点未到 1 只 · 数据缺失 1 只');
    const hit = screen.getByTestId('screen-row-sh600000');
    expect(within(hit).getByText('买点已到')).toBeInTheDocument();
    expect(within(hit).getByText('距涨停 4 日 · 缩量 42%')).toBeInTheDocument();
    const cand = screen.getByTestId('screen-row-sz000001');
    expect(within(cand).getByText('买点未到')).toBeInTheDocument();
    expect(within(cand).getByText('距涨停 8 日 · 缩量 70% · 60 分 MA13/25 未金叉')).toBeInTheDocument();
    const miss = screen.getByTestId('screen-row-sz300002');
    expect(within(miss).getByText('数据缺失')).toBeInTheDocument();
    expect(within(miss).getByText('日K拉取失败：接口超时')).toBeInTheDocument();
  });

  it('点结果行回调其代码', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    render(<ScreenerResults rows={rows} onView={onView} />);
    await user.click(screen.getByTestId('screen-row-sz000001'));
    expect(onView).toHaveBeenCalledWith('sz000001');
  });

  it('空态提示', () => {
    render(<ScreenerResults rows={[]} onView={() => {}} />);
    expect(screen.getByText('设置条件后点「开始筛选」')).toBeInTheDocument();
  });
});

describe('ScreenerResults 市场模式（2026-10-18）', () => {
  it('汇总加「已扫描 N 只」', () => {
    render(<ScreenerResults rows={rows} onView={() => {}} mode="market" scanned={5562} />);
    expect(screen.getByTestId('result-summary')).toHaveTextContent('买点已到 1 只 · 买点未到 1 只 · 数据缺失 1 只');
    expect(screen.getByTestId('result-summary')).toHaveTextContent('已扫描 5562 只');
  });

  it('数据缺失超过 30 条：逐条只展示 30 条 + 聚合行', () => {
    const many: ScreenRow[] = Array.from({ length: 35 }, (_, i) => ({
      stock: stock(`sz${String(100000 + i)}`, `缺失股${i}`),
      status: 'no-data',
      note: '数据陈旧'
    }));
    const { container } = render(
      <ScreenerResults rows={many} onView={() => {}} mode="market" scanned={5562} />
    );
    expect(container.querySelectorAll('[data-testid^="screen-row-"]')).toHaveLength(30);
    expect(screen.getByTestId('screen-miss-agg')).toHaveTextContent('其余 5 只数据缺失');
  });

  it('缺失未超限时不出现聚合行', () => {
    render(<ScreenerResults rows={rows} onView={() => {}} mode="market" scanned={3} />);
    expect(screen.queryByTestId('screen-miss-agg')).not.toBeInTheDocument();
  });

  it('扫描中空结果：显示进行中提示', () => {
    render(<ScreenerResults rows={[]} onView={() => {}} running emptyHint="点「开始筛选」扫描沪深A股" />);
    expect(screen.getByText('扫描进行中，进度见左侧条件面板')).toBeInTheDocument();
  });
});
