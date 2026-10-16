// Supabase 客户端：生产环境跨设备同步用，需用户账号与环境变量
// 本地/测试默认不使用，避免无凭证时报错
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;

/**
 * 返回 Supabase 客户端；未配置环境变量时返回 null（由调用方回退到内存仓库）。
 * 配置方式：环境变量 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key);
  return cached;
}
