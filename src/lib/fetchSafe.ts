// 浏览器安全的默认 fetch 封装
//
// 背景（2026-10-16 实测）：不能写 `const f = fetch` 或默认参数 `= fetch` 把 fetch
// 拆成引用再调用——部分 Chromium 内核浏览器会抛
//   "Failed to execute 'fetch' on 'Window': Illegal invocation"
// 因为 fetch 是 Window 上的 WebIDL 操作，脱离全局接收者调用即报错。
// Node/vitest 无此检查，所以测试里发现不了，只在真实浏览器复现。
//
// 修复：统一经 globalThis.fetch(...) 调用，保证接收者是全局对象。

/** 以全局为接收者调用 fetch，规避部分浏览器的 Illegal invocation */
export function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init);
}
