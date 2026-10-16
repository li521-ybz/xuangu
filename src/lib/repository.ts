// 自选股仓库抽象：模块① 数据层
// 设计：接口与实现分离，本地/测试用内存实现，生产用 Supabase 实现（见 supabaseRepo.ts）
import type { Stock } from './types';

export interface AddStockInput {
  symbol: string;
  name: string;
  group?: string;
}

export interface StockRepository {
  list(): Promise<Stock[]>;
  add(input: AddStockInput): Promise<Stock>;
  remove(id: string): Promise<void>;
  setGroup(id: string, group: string): Promise<void>;
}

const DEFAULT_GROUP = '观察';

function newId(): string {
  // 优先用 crypto.randomUUID，降级到时间戳+随机
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 内存实现：本地开发、单设备、测试默认使用，无需任何外部账号 */
export class InMemoryStockRepository implements StockRepository {
  private stocks: Stock[] = [];

  async list(): Promise<Stock[]> {
    return [...this.stocks];
  }

  async add(input: AddStockInput): Promise<Stock> {
    const symbol = input.symbol.trim();
    if (!symbol) throw new Error('股票代码不能为空');
    const stock: Stock = {
      id: newId(),
      symbol,
      name: input.name?.trim() || symbol,
      group: input.group?.trim() || DEFAULT_GROUP
    };
    this.stocks.push(stock);
    return stock;
  }

  async remove(id: string): Promise<void> {
    this.stocks = this.stocks.filter((s) => s.id !== id);
  }

  async setGroup(id: string, group: string): Promise<void> {
    const s = this.stocks.find((x) => x.id === id);
    if (!s) throw new Error('未找到该自选股');
    s.group = group;
  }
}

const LS_KEY = 'xuangu.stocks.v1';

/**
 * 本地持久化实现：无令牌时的默认仓库。
 * 数据存浏览器 localStorage，刷新/重开页面不丢；录入 GitHub 令牌后自动切换为 Gist 跨设备同步。
 */
export class LocalStorageStockRepository implements StockRepository {
  private read(): Stock[] {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private write(stocks: Stock[]): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(stocks));
    } catch {
      /* 隐私模式/配额满：静默降级为内存 */
    }
  }

  async list(): Promise<Stock[]> {
    return this.read();
  }

  async add(input: AddStockInput): Promise<Stock> {
    const symbol = input.symbol.trim();
    if (!symbol) throw new Error('股票代码不能为空');
    const stock: Stock = {
      id: newId(),
      symbol,
      name: input.name?.trim() || symbol,
      group: input.group?.trim() || DEFAULT_GROUP
    };
    const next = [...this.read(), stock];
    this.write(next);
    return stock;
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((s) => s.id !== id));
  }

  async setGroup(id: string, group: string): Promise<void> {
    const next = this.read().map((s) => (s.id === id ? { ...s, group } : s));
    this.write(next);
  }
}
