// 公共 CORS 代理：浏览器经它转发免费行情接口，规避 CORS（替代 Cloudflare Workers）
// 默认用 corsproxy.io；可通过 VITE_CORS_PROXY 换成 allorigins.win 或自建代理。
// 形如：https://corsproxy.io/?url= 或 https://api.allorigins.win/raw?url=
export function corsProxyUrl(target: string): string {
  const prefix =
    (import.meta.env?.VITE_CORS_PROXY as string | undefined) || 'https://corsproxy.io/?url=';
  return `${prefix}${encodeURIComponent(target)}`;
}
