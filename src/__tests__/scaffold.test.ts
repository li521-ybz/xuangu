// 阶段0 冒烟测试：验证工具链、模块图与基础能力可用
import { describe, it, expect } from 'vitest';
import { InMemoryStockRepository } from '../lib/repository';
import { parseSinaLine } from '../worker/parse';

describe('阶段0 脚手架冒烟', () => {
  it('内存仓库可增列，默认分组为「观察」', async () => {
    const r = new InMemoryStockRepository();
    const s = await r.add({ symbol: 'sh600000', name: '浦发银行' });
    expect(s.group).toBe('观察');
    expect((await r.list()).map((x) => x.symbol)).toContain('sh600000');
  });

  it('新浪实时行情解析：涨跌额/涨跌幅正确（红涨）', () => {
    const line =
      'var hq_str_sh600000="浦发银行,11.05,11.00,11.20,11.30,10.90,11.20,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2024-01-01 15:00:00"';
    const q = parseSinaLine(line);
    expect(q).not.toBeNull();
    expect(q!.symbol).toBe('sh600000');
    expect(q!.name).toBe('浦发银行');
    expect(q!.prevClose).toBe(11.0);
    expect(q!.price).toBe(11.2);
    expect(q!.change).toBeCloseTo(0.2);
    expect(q!.changePct).toBeCloseTo((0.2 / 11.0) * 100);
  });
});
