// GistStockRepository 单测：用内存态假 Gist 服务，覆盖建/读/删/改组/报错
import { describe, it, expect } from 'vitest';
import { GistStockRepository, verifyGithubToken } from './gistRepo';
import type { Stock } from './types';

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer
  } as any;
}

function gistServer(initial?: { id: string; content: string }) {
  const store: Record<string, any> = {};
  if (initial) store[initial.id] = { id: initial.id, files: { 'stocks.json': { content: initial.content } } };
  const calls: string[] = [];
  const fetchImpl = async (url: string, opts: any = {}) => {
    calls.push(`${opts.method || 'GET'} ${url}`);
    const method = opts.method || 'GET';
    if (method === 'POST' && url.endsWith('/gists')) {
      const id = 'g_' + Math.random().toString(36).slice(2, 8);
      const body = JSON.parse(opts.body);
      store[id] = { id, files: body.files };
      return ok({ id, files: body.files });
    }
    const m = url.match(/\/gists\/(.+)$/);
    if (m) {
      const id = m[1];
      if (method === 'GET') {
        return store[id]
          ? ok(store[id])
          : { ok: false, status: 404, json: async () => ({}), text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
      }
      if (method === 'PATCH') {
        const body = JSON.parse(opts.body);
        store[id] = { ...store[id], files: { ...store[id].files, ...body.files } };
        return ok(store[id]);
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
  };
  const read = (id: string): Stock[] => JSON.parse(store[id].files['stocks.json'].content).stocks;
  return { fetchImpl, calls, read };
}

describe('GistStockRepository', () => {
  it('无 gistId 时 list 返回空（不发请求）', async () => {
    const srv = gistServer();
    const repo = new GistStockRepository({ token: 't', fetchImpl: srv.fetchImpl });
    expect(await repo.list()).toEqual([]);
    expect(srv.calls.length).toBe(0);
  });

  it('add 自动创建 Gist 并写入，回调返回 id', async () => {
    const srv = gistServer();
    let created = '';
    const repo = new GistStockRepository({ token: 't', fetchImpl: srv.fetchImpl, onGistCreated: (id) => (created = id) });
    const stock = await repo.add({ symbol: 'sh600000', name: '浦发' });
    expect(stock.symbol).toBe('sh600000');
    expect(created).toBeTruthy();
    // 无 gist 时 add 仅 POST 创建（PATCH 发生在后续写入）
    expect(srv.calls.some((c) => c.startsWith('POST https://api.github.com/gists'))).toBe(true);
    expect(srv.calls.some((c) => c.startsWith('PATCH'))).toBe(false);
  });

  it('list 读取已有 Gist 内容', async () => {
    const content = JSON.stringify({ version: 1, stocks: [{ id: '1', symbol: 'sh600000', name: '浦发', group: '观察' }] });
    const srv = gistServer({ id: 'g1', content });
    const repo = new GistStockRepository({ token: 't', gistId: 'g1', fetchImpl: srv.fetchImpl });
    const list = await repo.list();
    expect(list.length).toBe(1);
    expect(list[0].symbol).toBe('sh600000');
  });

  it('remove 过滤后写回', async () => {
    const content = JSON.stringify({
      version: 1,
      stocks: [
        { id: '1', symbol: 'sh600000', name: '浦发', group: '观察' },
        { id: '2', symbol: 'sz000001', name: '平安', group: '持仓' }
      ]
    });
    const srv = gistServer({ id: 'g1', content });
    const repo = new GistStockRepository({ token: 't', gistId: 'g1', fetchImpl: srv.fetchImpl });
    await repo.remove('1');
    expect(srv.read('g1').length).toBe(1);
    expect(srv.read('g1')[0].symbol).toBe('sz000001');
  });

  it('setGroup 更新分组', async () => {
    const content = JSON.stringify({ version: 1, stocks: [{ id: '1', symbol: 'sh600000', name: '浦发', group: '观察' }] });
    const srv = gistServer({ id: 'g1', content });
    const repo = new GistStockRepository({ token: 't', gistId: 'g1', fetchImpl: srv.fetchImpl });
    await repo.setGroup('1', '持仓');
    expect(srv.read('g1')[0].group).toBe('持仓');
  });

  it('401 抛出带令牌提示的错误', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) }) as any;
    const repo = new GistStockRepository({ token: 'bad', gistId: 'g1', fetchImpl });
    await expect(repo.list()).rejects.toThrow(/令牌/);
  });

  it('空代码抛错', async () => {
    const srv = gistServer();
    const repo = new GistStockRepository({ token: 't', fetchImpl: srv.fetchImpl });
    await expect(repo.add({ symbol: '   ' })).rejects.toThrow('股票代码不能为空');
  });
});

describe('verifyGithubToken', () => {
  function userRes(status: number, body: unknown = {}, scopes?: string) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      headers: { get: (k: string) => (k === 'x-oauth-scopes' && scopes !== undefined ? scopes : null) }
    } as any;
  }

  it('有效令牌返回 ok 并带上用户名', async () => {
    const r = await verifyGithubToken('ghp_x', async () => userRes(200, { login: 'li521' }, 'gist, read:user'));
    expect(r.ok).toBe(true);
    expect(r.message).toContain('li521');
  });

  it('401 提示令牌无效', async () => {
    const r = await verifyGithubToken('bad', async () => userRes(401));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('401');
  });

  it('classic 令牌缺 gist scope 时提示补权限', async () => {
    const r = await verifyGithubToken('ghp_x', async () => userRes(200, { login: 'li521' }, 'read:user, repo'));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('gists');
  });

  it('网络异常时返回错误信息不抛出', async () => {
    const r = await verifyGithubToken('ghp_x', async () => {
      throw new Error('network down');
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('网络错误');
  });
});
