// GitHub Gist 仓库：模块① 跨设备同步的「零后端」实现（替代 Supabase）
// 把自选股存进你的【私有 Gist】（stocks.json），只需一个 GitHub 个人令牌（gists 权限）。
// 架构参考开源实践（gist-ledger / Scrooge.js / @repus/gist-sync）：数据在你自己的 Gist，无第三方数据库。
import type { Stock } from './types';
import type { AddStockInput, StockRepository } from './repository';
import { safeFetch } from './fetchSafe';

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

/** 把 GitHub API 非 2xx 转成用户看得懂的中文错误（令牌问题重点提示） */
function ghError(action: string, status: number): Error {
  if (status === 401)
    return new Error(`${action}失败：GitHub 令牌无效或已过期（401）。请到「设置」重新粘贴有效令牌（需有 gists 权限）`);
  if (status === 403)
    return new Error(`${action}失败：令牌权限不足或被限流（403）。请确认令牌已勾选 gists 权限，稍后重试`);
  return new Error(`${action}失败：GitHub 返回 ${status}`);
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
    this.fetchImpl = opts.fetchImpl ?? safeFetch;
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
    if (!res.ok) throw ghError('读取自选股', res.status);
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
      if (!res.ok) throw ghError('创建 Gist', res.status);
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
    if (!res.ok) throw ghError('写入 Gist', res.status);
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

/**
 * 校验令牌是否可用：GET /user 验身份；classic 令牌再核对 x-oauth-scopes 是否含 gist。
 * 供「设置」弹层的「测试令牌」按钮使用，不写入任何数据。
 */
export async function verifyGithubToken(
  token: string,
  fetchImpl?: typeof fetch
): Promise<{ ok: boolean; message: string }> {
  const f = fetchImpl ?? safeFetch;
  try {
    const res = await f(`${API}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'xuangu-app'
      }
    });
    if (res.status === 401) return { ok: false, message: '令牌无效或已过期（401），请重新生成' };
    if (res.status === 403) return { ok: false, message: '令牌被拒绝或触发限流（403），稍后重试' };
    if (!res.ok) return { ok: false, message: `GitHub 返回 ${res.status}` };
    const scopes = res.headers?.get?.('x-oauth-scopes');
    if (typeof scopes === 'string' && scopes.length > 0 && !scopes.split(',').map((s) => s.trim()).includes('gist')) {
      return { ok: false, message: '令牌有效但未包含 gists 权限，请重新生成并勾选 gist' };
    }
    let login = '';
    try {
      const data = await res.json();
      login = data?.login ?? '';
    } catch {
      /* 忽略解析失败 */
    }
    return { ok: true, message: login ? `令牌有效（${login}）` : '令牌有效' };
  } catch (e) {
    return { ok: false, message: `网络错误：${(e as Error).message}` };
  }
}
