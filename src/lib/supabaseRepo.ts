// Supabase 实现：模块① 生产数据层（跨设备同步）
// 仅当配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 时启用；本地/测试用 InMemoryStockRepository。
import type { Stock } from './types';
import type { AddStockInput, StockRepository } from './repository';

// 最小接口，便于测试注入 fake client（真实 @supabase/supabase-js 客户端结构兼容）
export interface SupabaseLike {
  from(table: string): {
    select: (cols?: string) => Promise<{ data: any[] | null; error: any }>;
    insert: (rows: any[]) => { select: () => Promise<{ data: any[] | null; error: any }> };
    delete: () => { eq: (col: string, val: any) => Promise<{ error: any }> };
    update: (patch: any) => { eq: (col: string, val: any) => Promise<{ error: any }> };
  };
}

interface StockRow {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  grp: string;
  created_at?: string;
}

export function rowToStock(row: StockRow): Stock {
  return { id: row.id, symbol: row.symbol, name: row.name, group: row.grp };
}

export function stockToRow(stock: Stock, userId: string): StockRow {
  return { id: stock.id, user_id: userId, symbol: stock.symbol, name: stock.name, grp: stock.group };
}

/** Supabase 仓库：表 stocks，字段 id/user_id/symbol/name/grp/created_at */
export class SupabaseStockRepository implements StockRepository {
  constructor(private client: SupabaseLike, private userId: string) {}

  async list(): Promise<Stock[]> {
    const { data, error } = await this.client.from('stocks').select('*');
    if (error) throw error;
    return (data ?? []).map(rowToStock).filter((s) => s.group !== undefined);
  }

  async add(input: AddStockInput): Promise<Stock> {
    const symbol = input.symbol.trim();
    if (!symbol) throw new Error('股票代码不能为空');
    const stock: Stock = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s_${Date.now()}`,
      symbol,
      name: input.name.trim() || symbol,
      group: input.group?.trim() || '观察'
    };
    const { data, error } = await this.client
      .from('stocks')
      .insert([stockToRow(stock, this.userId)])
      .select();
    if (error) throw error;
    return data && data[0] ? rowToStock(data[0]) : stock;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('stocks').delete().eq('id', id);
    if (error) throw error;
  }

  async setGroup(id: string, group: string): Promise<void> {
    const { error } = await this.client.from('stocks').update({ grp: group }).eq('id', id);
    if (error) throw error;
  }
}
