// 模块① 自选股列表：状态 hook（依赖注入仓库，便于测试与本地/生产切换）
import { useCallback, useEffect, useState } from 'react';
import type { GroupName, Stock } from '../../lib/types';
import type { AddStockInput, StockRepository } from '../../lib/repository';

export function useWatchlist(repo: StockRepository) {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStocks(await repo.list());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(
    async (input: AddStockInput) => {
      setError(null);
      try {
        const s = await repo.add(input);
        setStocks((prev) => [...prev, s]);
        return s;
      } catch (e) {
        setError((e as Error).message);
        throw e; // 抛给弹层展示具体原因，并保持弹层不关闭
      }
    },
    [repo]
  );

  const remove = useCallback(
    async (id: string) => {
      await repo.remove(id);
      setStocks((prev) => prev.filter((s) => s.id !== id));
    },
    [repo]
  );

  // 分组转移（观察 ↔ 持仓 / 自定义组）：失败原因进页面横幅，并抛给调用方决定是否静默
  const setGroup = useCallback(
    async (id: string, group: string) => {
      setError(null);
      try {
        await repo.setGroup(id, group);
        setStocks((prev) => prev.map((s) => (s.id === id ? { ...s, group } : s)));
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    },
    [repo]
  );

  return { stocks, loading, error, load, add, remove, setGroup };
}

/** 去重后的分组列表（保证含默认分组） */
export function groupsOf(stocks: Stock[]): GroupName[] {
  const set = new Set<GroupName>(['持仓', '观察']);
  stocks.forEach((s) => set.add(s.group));
  return Array.from(set);
}
