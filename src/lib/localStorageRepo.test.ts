// 本地持久化仓库测试：无令牌默认实现，刷新不丢
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageStockRepository } from './repository';

describe('LocalStorageStockRepository', () => {
  beforeEach(() => localStorage.clear());

  it('add 后 list 能读回，且写入 localStorage', async () => {
    const r = new LocalStorageStockRepository();
    const s = await r.add({ symbol: 'sh600000', name: '浦发银行', group: '观察' });
    expect(s.symbol).toBe('sh600000');
    const list = await r.list();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('浦发银行');
    expect(localStorage.getItem('xuangu.stocks.v1')).toContain('sh600000');
  });

  it('新实例能读回上一次写入（模拟刷新页面）', async () => {
    const a = new LocalStorageStockRepository();
    await a.add({ symbol: 'sz000001', name: '平安银行' });
    const b = new LocalStorageStockRepository(); // 模拟页面刷新后新建实例
    const list = await b.list();
    expect(list.length).toBe(1);
    expect(list[0].symbol).toBe('sz000001');
  });

  it('remove 后持久化移除', async () => {
    const r = new LocalStorageStockRepository();
    const s = await r.add({ symbol: 'sh600000' });
    await r.remove(s.id);
    expect(await r.list()).toHaveLength(0);
  });

  it('setGroup 后持久化改组', async () => {
    const r = new LocalStorageStockRepository();
    const s = await r.add({ symbol: 'sh600000', group: '观察' });
    await r.setGroup(s.id, '持仓');
    const list = await r.list();
    expect(list[0].group).toBe('持仓');
  });

  it('代码为空抛错', async () => {
    const r = new LocalStorageStockRepository();
    await expect(r.add({ symbol: '   ' })).rejects.toThrow('股票代码不能为空');
  });
});
