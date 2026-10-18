// 市场名单 hook 测试：激活才拉取、缓存优先、失败降级、强制刷新
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMarketRoster } from './useMarketRoster';
import {
  fetchMarketRoster,
  loadCachedRoster,
  saveCachedRoster,
  todayStr,
  type MarketRoster
} from '../../lib/marketList';

vi.mock('../../lib/marketList', () => ({
  fetchMarketRoster: vi.fn(),
  loadCachedRoster: vi.fn(),
  saveCachedRoster: vi.fn(),
  todayStr: vi.fn(() => '2026-10-18')
}));

const ROSTER: MarketRoster = {
  date: '2026-10-18',
  source: 'eastmoney',
  stocks: [{ id: 'sh600000', symbol: 'sh600000', name: '浦发银行', group: '沪深A股' }]
};

/** 冲干净微任务（fetch 链 .then/.finally 需要几轮） */
const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(todayStr).mockReturnValue('2026-10-18');
  vi.mocked(loadCachedRoster).mockReturnValue(null);
});

describe('useMarketRoster', () => {
  it('激活时拉取名单、写缓存、状态收敛', async () => {
    vi.mocked(fetchMarketRoster).mockResolvedValue(ROSTER);
    const { result } = renderHook(() => useMarketRoster(true));
    expect(result.current.loading).toBe(true);

    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.stocks).toHaveLength(1);
    expect(result.current.source).toBe('eastmoney');
    expect(result.current.error).toBeNull();
    expect(saveCachedRoster).toHaveBeenCalledWith(ROSTER);
  });

  it('未激活（自选股范围）不拉取', async () => {
    const { result } = renderHook(() => useMarketRoster(false));
    await flush();
    expect(fetchMarketRoster).not.toHaveBeenCalled();
    expect(result.current.stocks).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });

  it('拉取失败且无缓存 → 报错（面板给重试）', async () => {
    vi.mocked(fetchMarketRoster).mockRejectedValue(new Error('网络不通'));
    const { result } = renderHook(() => useMarketRoster(true));
    await flush();
    expect(result.current.error).toContain('名单获取失败');
    expect(result.current.error).toContain('网络不通');
    expect(result.current.stocks).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });

  it('拉取失败但有旧缓存 → 降级沿用并提示', async () => {
    vi.mocked(loadCachedRoster).mockReturnValue({ ...ROSTER, date: '2026-10-18' });
    vi.mocked(fetchMarketRoster).mockRejectedValue(new Error('网络不通'));
    const { result } = renderHook(() => useMarketRoster(true));
    await flush();
    expect(result.current.error).toBeNull();
    expect(result.current.note).toContain('沿用 2026-10-18 缓存');
    expect(result.current.stocks).toHaveLength(1);
  });

  it('当天已有缓存：激活只拉一次，切走再切回零重复请求', async () => {
    vi.mocked(loadCachedRoster).mockReturnValue(ROSTER); // date = 今天
    vi.mocked(fetchMarketRoster).mockResolvedValue(ROSTER);
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useMarketRoster(active),
      { initialProps: { active: true } }
    );
    await flush();
    expect(fetchMarketRoster).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    rerender({ active: true });
    await flush();
    expect(fetchMarketRoster).toHaveBeenCalledTimes(1);
    expect(result.current.stocks).toHaveLength(1);
  });

  it('refresh() 强制重拉（忽略当天已加载标记）', async () => {
    vi.mocked(fetchMarketRoster).mockResolvedValue(ROSTER);
    const { result } = renderHook(() => useMarketRoster(true));
    await flush();
    expect(fetchMarketRoster).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refresh();
    });
    await flush();
    expect(fetchMarketRoster).toHaveBeenCalledTimes(2);
  });
});
