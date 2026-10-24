export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined>;

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}${path.includes('?') ? '&' : '?'}${s}` : path;
}

export async function api<T>(
  path: string,
  opts: { method?: string; query?: Query; body?: unknown } = {},
): Promise<T> {
  const res = await fetch('/api' + withQuery(path, opts.query), {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // 非 JSON 响应
  }
  if (!res.ok) {
    const message = data?.error_message || data?.msg || `请求失败（${res.status}）`;
    throw new ApiError(message, res.status, data?.error_code);
  }
  return data as T;
}
