// safeFetch 回归测试：防止有人改回「拆引用调用 fetch」的写法
// （该写法在部分 Chromium 浏览器报 Illegal invocation，但 Node 测试环境无此检查）
import { describe, it, expect, vi } from 'vitest';
import { safeFetch } from './fetchSafe';

describe('safeFetch', () => {
  it('以全局为接收者调用 fetch（规避浏览器 Illegal invocation）', async () => {
    let receiver: unknown = null;
    const spy = vi.fn(function (this: unknown) {
      receiver = this;
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as any);
    });
    vi.stubGlobal('fetch', spy);
    try {
      await safeFetch('https://example.com/api');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('https://example.com/api', undefined);
      expect(receiver).toBe(globalThis);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
