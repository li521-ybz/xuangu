// GitHub Gist 仓库：模块① 跨设备同步的「零后端」实现（替代 Supabase）
// 把自选股存进你的【私有 Gist】（stocks.json），只需一个 GitHub 个人令牌（gists 权限）。
// 架构参考开源实践（gist-ledger / Scrooge.js / @repus/gist-sync）：数据在你自己的 Gist，无第三方数据库。
import type { Stock } from './types';
import type { AddStockInput, StockRepository } from './repository';

export const GH_TOKEN_KEY = 'xuangu_gh_token';
export const GH_GIST_KEY = 'xuangu_gh_gist';
const FILE = 'stocks.json';
const API = 'https://api.github.com';

export interface GistRepoOptions {
  token: string;
  gistId?: string;
  fileName?: string;
  fetchImpl?: typeof fetch;
  onGistCreated?: (id: string) => void;
}

interface GistFileShape {
  version: number;
  stocks: Stock[];
}

/** 用 GitHub 私有 Gist 存自选股，实现 StockRepository 接口 */
export class GistStockRepository implements StockRepository {
  private token: string;
  private gistId?: string;
  private fileName: string;
  private fetchImpl: typeof fetch;
  private onGistCreated?: (id: string) => void;

  constructor(opts: GistRepoOptions) {
    this.token = opts.token;
    this.gistId = opts.gistId;
    this.fileName = opts.fileName ?? FILE;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.onGistCreated = opts.onGistCreated;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'xuangu-app'
    };
  }

  private async readStocks(): Promise<Stock[]> {
    if (!this.gistId) return [];
    const res = await this.fetchImpl(`${API}/gists/${this.gistId}`, { headers: this.headers() });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub 返回 ${res.status}`);
    const data = await res.json();
    const content = data?.files?.[this.fileName]?.content;
    if (!content) return [];
    try {
      const parsed = JSON.parse(content) as GistFileShape;
      return Array.isArray(parsed.stocks) ? parsed.stocks : [];
    } catch {
      return [];
    }
  }

  private async writeStocks(stocks: Stock[]): Promise<void> {
    const content = JSON.stringify({ version: 1, stocks });
    if (!this.gistId) {
      const res = await this.fetchImpl(`${API}/gists`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ description: 'xuangu 自选股', files: { [this.fileName]: { content } } })
      });
      if (!res.ok) throw new Error(`创建 Gist 失败 ${res.status}`);
      const data = await res.json();
      this.gistId = data.id;
      this.onGistCreated?.(data.id);
      return;
    }
    const res = await this.fetchImpl(`${API}/gists/${this.gistId}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ files: { [this.fileName]: { content } } })
    });
    if (!res.ok) throw new Error(`写入 Gist 失败 ${res.status}`);
  }

  async list(): Promise<Stock[]> {
    return this.readStocks();
  }

  async add(input: AddStockInput): Promise<Stock> {
    const symbol = input.symbol.trim();
    if (!symbol) throw new Error('股票代码不能为空');
    const stock: Stock = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      symbol,
      name: input.name.trim() || symbol,
      group: input.group?.trim() || '观察'
    };
    const stocks = await this.readStocks();
    stocks.push(stock);
    await this.writeStocks(stocks);
    return stock;
  }

  async remove(id: string): Promise<void> {
    const stocks = await this.readStocks();
    await this.writeStocks(stocks.filter((s) => s.id !== id));
  }

  async setGroup(id: string, group: string): Promise<void> {
    const stocks = await this.readStocks();
    const s = stocks.find((x) => x.id === id);
    if (!s) throw new Error('未找到该自选股');
    s.group = group;
    await this.writeStocks(stocks);
  }
}

// ---- 浏览器侧：localStorage 持久化令牌 / Gist id ----

function safeLocal(get: () => string | null): string | null {
  try {
    return get();
  } catch {
    return null;
  }
}

export function getStoredGithubToken(): string | null {
  return safeLocal(() => localStorage.getItem(GH_TOKEN_KEY));
}

export function setStoredGithubToken(token: string): void {
  try {
    localStorage.setItem(GH_TOKEN_KEY, token);
  } catch {
    /* 忽略隐私模式等异常 */
  }
}

export function getStoredGistId(): string | null {
  return safeLocal(() => localStorage.getItem(GH_GIST_KEY));
}

export function setStoredGistId(id: string): void {
  try {
    localStorage.setItem(GH_GIST_KEY, id);
  } catch {
    /* 忽略 */
  }
}

/** 从 localStorage / 构建期环境变量构造 Gist 仓库；无令牌时返回 null（由调用方回退内存仓库） */
export function createGistRepositoryFromStorage(
  fetchImpl?: typeof fetch
): GistStockRepository | null {
  const token =
    getStoredGithubToken() ?? (import.meta.env?.VITE_GITHUB_TOKEN as string | undefined);
  if (!token) return null;
  return new GistStockRepository({
    token,
    gistId: getStoredGistId() ?? undefined,
    fetchImpl,
    onGistCreated: setStoredGistId
  });
}
