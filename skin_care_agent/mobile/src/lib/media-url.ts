const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function resolveMediaUrl(url: string, apiBaseUrl: string): string {
  try {
    const source = new URL(url);
    if (!LOCAL_HOSTS.has(source.hostname)) return url;
    const api = new URL(apiBaseUrl);
    source.protocol = api.protocol;
    source.hostname = api.hostname;
    source.port = api.port;
    return source.toString();
  } catch {
    return url;
  }
}
