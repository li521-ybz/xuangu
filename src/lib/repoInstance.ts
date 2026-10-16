// 仓库实例：优先 GitHub Gist（零后端，只需令牌）> Supabase（可选）> 内存（默认/无凭证）
import type { StockRepository } from './repository';
import { InMemoryStockRepository } from './repository';
import { getSupabaseClient } from './supabaseClient';
import { SupabaseStockRepository } from './supabaseRepo';
import { createGistRepositoryFromStorage } from './gistRepo';

export function createStockRepository(): StockRepository {
  const gist = createGistRepositoryFromStorage();
  if (gist) return gist;
  const client = getSupabaseClient();
  if (client) {
    const userId = (import.meta.env?.VITE_SUPABASE_USER_ID as string) || 'local';
    return new SupabaseStockRepository(client, userId);
  }
  return new InMemoryStockRepository();
}
