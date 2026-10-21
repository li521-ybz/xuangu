// 仓库实例：优先 GitHub Gist（零后端，只需令牌）> Supabase（可选）> 内存（默认/无凭证）
import type { StockRepository } from './repository';
import { InMemoryStockRepository, LocalStorageStockRepository } from './repository';
import { getSupabaseClient } from './supabaseClient';
import { SupabaseStockRepository, type SupabaseLike } from './supabaseRepo';
import { createGistRepositoryFromStorage } from './gistRepo';

export function createStockRepository(): StockRepository {
  const gist = createGistRepositoryFromStorage();
  if (gist) return gist;
  const client = getSupabaseClient();
  if (client) {
    const userId = (import.meta.env?.VITE_SUPABASE_USER_ID as string) || 'local';
    // 官方 SupabaseClient 的泛型（schema/relations）比这里的结构化接口更严，运行期完全兼容
    return new SupabaseStockRepository(client as unknown as SupabaseLike, userId);
  }
  // 无令牌：默认本地持久化（刷新不丢）；测试可改用内存实现
  if (typeof localStorage !== 'undefined') return new LocalStorageStockRepository();
  return new InMemoryStockRepository();
}
