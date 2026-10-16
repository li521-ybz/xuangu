// 阶段1 仓库测试：内存实现 + Supabase 实现（注入 fake client，不依赖网络）
import { describe, it, expect } from 'vitest';
import { InMemoryStockRepository } from '../../lib/repository';
import { SupabaseStockRepository, type SupabaseLike } from '../../lib/supabaseRepo';
import type { StockRow } from '../../lib/supabaseRepo';

function fakeSupabase() {
  const store: StockRow[] = [];
  const client: SupabaseLike = {
    from: () => ({
      select: async () => ({ data: store, error: null }),
      insert: (rows: StockRow[]) => ({
        select: async () => {
          rows.forEach((r) => store.push(r));
          return { data: rows, error: null };
        }
      }),
      delete: () => ({
        eq: async (col: string, val: unknown) => {
          const i = store.findIndex((r) => (r as any)[col] === val);
          if (i >= 0) store.splice(i, 1);
          return { error: null };
        }
      }),
      update: (patch: any) => ({
        eq: async (col: string, val: unknown) => {
          const r = store.find((x) => (x as any)[col] === val);
          if (r) Object.assign(r, patch);
          return { error: null };
        }
      })
    })
  };
  return { client, store };
}

describe('InMemoryStockRepository', () => {
  it('增/列/删/改分组', async () => {
    const r = new InMemoryStockRepository();
    const a = await r.add({ symbol: 'sh600000', name: '浦发' });
    const b = await r.add({ symbol: 'sz000001', name: '平安', group: '持仓' });
    expect((await r.list()).length).toBe(2);
    expect(a.group).toBe('观察');
    expect(b.group).toBe('持仓');
    await r.setGroup(a.id, '持仓');
    expect((await r.list()).find((s) => s.id === a.id)!.group).toBe('持仓');
    await r.remove(b.id);
    expect((await r.list()).map((s) => s.id)).not.toContain(b.id);
  });

  it('空代码抛错', async () => {
    const r = new InMemoryStockRepository();
    await expect(r.add({ symbol: '  ' })).rejects.toThrow();
  });
});

describe('SupabaseStockRepository（fake client）', () => {
  it('add 写入 stocks 表并映射分组', async () => {
    const { client, store } = fakeSupabase();
    const repo = new SupabaseStockRepository(client, 'u1');
    const s = await repo.add({ symbol: 'sh600000', name: '浦发' });
    expect(store.length).toBe(1);
    expect(store[0].user_id).toBe('u1');
    expect(store[0].grp).toBe('观察');
    expect(s.symbol).toBe('sh600000');
  });

  it('list 映射行 -> Stock', async () => {
    const { client, store } = fakeSupabase();
    store.push({ id: 'x', user_id: 'u1', symbol: 'sh600000', name: '浦发', grp: '观察' });
    const repo = new SupabaseStockRepository(client, 'u1');
    const list = await repo.list();
    expect(list[0]).toEqual({ id: 'x', symbol: 'sh600000', name: '浦发', group: '观察' });
  });

  it('setGroup 调 update，remove 调 delete', async () => {
    const { client, store } = fakeSupabase();
    store.push({ id: 'x', user_id: 'u1', symbol: 'sh600000', name: '浦发', grp: '观察' });
    const repo = new SupabaseStockRepository(client, 'u1');
    await repo.setGroup('x', '持仓');
    expect(store[0].grp).toBe('持仓');
    await repo.remove('x');
    expect(store.length).toBe(0);
  });
});
