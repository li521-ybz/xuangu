/// <reference types="vite/client" />

// Vite 环境变量类型（2026-10-21 补）：项目里 supabaseClient / repoInstance / gistRepo
// 都读 import.meta.env，缺这份声明时 tsc 会报 "Property 'env' does not exist on type 'ImportMeta'"。
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
