// 模块①×④ 集成：市场模式结果行行内加自选（2026-10-18，用户拍板 A 方案）
// 场景依赖全市场名单 + 扫描结果，mock 两个 screener hook 聚焦验证接线：
// WatchlistPage → ScreenerResults(onAdd/watchGroups) → useWatchlist.add → 行徽章变「已xx」。
// fetch 统一 stub 拒绝：useQuotes 走降级路径，不依赖外网（与 watchlist.test.tsx 同思路）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreenerPage } from './ScreenerPage';
import { InMemoryStockRepository, type StockRepository } from '../../lib/repository';

// 名单与结果数据内联在工厂里：vi.mock 提升到 imports 之前，工厂外引用会「初始化前访问」
vi.mock('./useMarketRoster', () => ({
  useMarketRoster: () => ({
    stocks: [
      { id: 'r1', symbol: 'sh600000', name: '浦发银行', group: '观察' },
      { id: 'r2', symbol: 'sz000001', name: '平安银行', group: '观察' }
    ],
    source: 'eastmoney',
    date: '2026-10-18',
    loading: false,
    error: null,
    note: null,
    refresh: () => {}
  })
}));

vi.mock('./useScreener', () => ({
  useScreener: () => ({
    rows: [
      {
        stock: { id: 'r1', symbol: 'sh600000', name: '浦发银行', group: '观察' },
        status: 'hit',
        main: { pass: true, limitUpIndex: 20, daysSinceLimitUp: 4, shrinkActual: 0.42, failReasons: [] }
      },
      {
        stock: { id: 'r2', symbol: 'sz000001', name: '平安银行', group: '观察' },
        status: 'candidate',
        main: { pass: true, limitUpIndex: 20, daysSinceLimitUp: 8, shrinkActual: 0.7, failReasons: [] },
        buy: {
          pass: false,
          branch: 'far',
          checks: { closeAboveMa10: true, bollNarrow: true, maCross: false },
          failReasons: ['60 分 MA13/25 未金叉']
        }
      }
    ],
    running: false,
    scanned: 5562,
    progress: '',
    toggles: {},
    toggle: () => {},
    priceRange: { min: null, max: null },
    setPriceRange: () => {},
    run: () => {},
    cancel: () => {},
    reset: () => {}
  })
}));

async function enterMarketScope(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '沪深A股' }));
}

describe('ScreenerPage 市场模式行内添加（2026-10-21 从自选页迁入）', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('＋ → 观察/持仓 即点即加：行徽章变「已xx」，仓库写入对应分组', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('stubbed'))));
    const repo = new InMemoryStockRepository();
    render(<ScreenerPage repo={repo} />);

    await enterMarketScope(user);
    const row1 = await screen.findByTestId('screen-row-sh600000');
    const row2 = screen.getByTestId('screen-row-sz000001');
    expect(within(row1).getByTestId('screen-add-sh600000')).toBeInTheDocument();

    // 第一只 → 观察
    await user.click(within(row1).getByTestId('screen-add-sh600000'));
    await user.click(within(row1).getByRole('button', { name: '观察' }));
    await waitFor(() =>
      expect(screen.getByTestId('screen-added-sh600000')).toHaveTextContent('已观察')
    );
    expect(within(row1).queryByTestId('screen-add-sh600000')).not.toBeInTheDocument();

    // 第二只 → 持仓（互不影响）
    await user.click(within(row2).getByTestId('screen-add-sz000001'));
    await user.click(within(row2).getByRole('button', { name: '持仓' }));
    await waitFor(() =>
      expect(screen.getByTestId('screen-added-sz000001')).toHaveTextContent('已持仓')
    );

    // 仓库确实落盘（组名与点选一致）
    const list = await repo.list();
    expect(list).toHaveLength(2);
    expect(list.find((s) => s.symbol === 'sh600000')).toMatchObject({ name: '浦发银行', group: '观察' });
    expect(list.find((s) => s.symbol === 'sz000001')).toMatchObject({ group: '持仓' });
  });

  it('添加失败（仓库抛错）：行保持「＋」可重试，页面横幅显示原因', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('stubbed'))));
    class FailingRepo implements StockRepository {
      async list() {
        return [];
      }
      async add(): Promise<never> {
        throw new Error('写入失败：GitHub 令牌无效或已过期（401）');
      }
      async remove() {}
      async setGroup() {}
    }
    render(<ScreenerPage repo={new FailingRepo()} />);

    await enterMarketScope(user);
    const row1 = await screen.findByTestId('screen-row-sh600000');
    await user.click(within(row1).getByTestId('screen-add-sh600000'));
    await user.click(within(row1).getByRole('button', { name: '持仓' }));

    await waitFor(() => expect(screen.getByText(/令牌无效或已过期/)).toBeInTheDocument());
    // 未加入成功：仍是「＋」，无「已xx」徽章
    expect(screen.queryByTestId('screen-added-sh600000')).not.toBeInTheDocument();
    expect(within(row1).getByTestId('screen-add-sh600000')).toBeInTheDocument();
  });

  it('已入自选的股票（重开页面后缓存命中）：行直接显示「已观察」，无「＋」', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('stubbed'))));
    const repo = new InMemoryStockRepository();
    await repo.add({ symbol: 'sh600000', name: '浦发银行', group: '观察' });
    render(<ScreenerPage repo={repo} />);

    await enterMarketScope(user);
    expect(await screen.findByTestId('screen-added-sh600000')).toHaveTextContent('已观察');
    expect(screen.queryByTestId('screen-add-sh600000')).not.toBeInTheDocument();
  });
});
