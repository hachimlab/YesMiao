// YesMiao API 代理：浏览器 -> /api/* -> https://api.codemao.cn/*
// 编程猫 API 只允许 *.codemao.cn 跨域，所以所有请求都经由这里转发。
// 运行在 EdgeOne Edge Functions 上，本地开发时由 vite.config.ts 直接调用同一个 onRequest。

const UPSTREAM = 'https://api.codemao.cn';
const TOKEN_COOKIE = 'ym_token';
const TOKEN_MAX_AGE = 60 * 60 * 24 * 30;
const COMMUNITY_PID = '65edCTyg';

// 只放行站点用到的接口，避免被当成开放代理
const ALLOWED = [
  /^\/web\/forums\//,
  /^\/web\/reports\/(posts|comments)/,
  /^\/web\/banners\/all$/,
  /^\/web\/config\/opr\/limit\/toast\/text$/,
  /^\/web\/users\/(details|recommended)$/,
  /^\/web\/message-record/,
  /^\/web\/works\//,
  /^\/web\/discussions\//,
  /^\/web\/shops\//,
  /^\/creation-tools\/v[12]\//,
  /^\/nemo\/v2\/works\/(web\/)?\d+\//,
  /^\/nemo\/v2\/work\/name\/search$/,
  /^\/nemo\/v2\/user\/\d+\/follow$/,
  /^\/api\/user\/info\/detail\/\d+$/,
  /^\/tiger\/v3\/web\/accounts\/info$/,
];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function readToken(request) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === TOKEN_COOKIE) return decodeURIComponent(v.join('='));
  }
  return '';
}

function tokenCookie(token, maxAge) {
  return `${TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function upstreamHeaders(token, contentType) {
  const headers = new Headers({
    Accept: 'application/json, text/plain, */*',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  if (contentType) headers.set('Content-Type', contentType);
  // 官方前端把 token 存在 authorization cookie 里
  if (token) headers.set('Cookie', `authorization=${token}`);
  return headers;
}

async function login(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error_message: '请求格式错误' }, 400);
  }
  const res = await fetch(`${UPSTREAM}/tiger/v3/web/accounts/login`, {
    method: 'POST',
    headers: upstreamHeaders('', 'application/json'),
    body: JSON.stringify({ pid: COMMUNITY_PID, identity: body.identity, password: body.password }),
  });
  const data = await res.json().catch(() => ({ error_message: '登录服务返回异常' }));
  const token = data && data.auth && data.auth.token;
  if (!res.ok || !token) {
    return json({ error_message: data.error_message || '登录失败', error_code: data.error_code }, res.ok ? 502 : res.status);
  }
  // token 只放在 httpOnly cookie 里，不交给页面脚本
  return json({ user_info: data.user_info }, 200, { 'Set-Cookie': tokenCookie(token, TOKEN_MAX_AGE) });
}

async function proxy(request, path, search) {
  if (!ALLOWED.some((re) => re.test(path))) {
    return json({ error_message: '该接口未开放' }, 403);
  }
  const token = readToken(request);
  const method = request.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  const res = await fetch(`${UPSTREAM}${path}${search}`, {
    method,
    headers: upstreamHeaders(token, request.headers.get('content-type')),
    body: hasBody ? await request.text() : undefined,
    redirect: 'manual',
  });

  const headers = new Headers();
  const contentType = res.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  // 登录态的数据（is_liked 之类）不能被共享缓存；未登录的读请求让浏览器缓存 30 秒，省函数调用次数
  headers.set('Cache-Control', method === 'GET' && !token ? 'private, max-age=30' : 'no-store');
  if (res.status === 401 && token) headers.set('Set-Cookie', tokenCookie('', 0));

  const noBody = res.status === 204 || res.status === 304 || method === 'HEAD';
  return new Response(noBody ? null : res.body, { status: res.status, headers });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';

  try {
    if (path === '/_auth/login' && request.method === 'POST') return await login(request);
    if (path === '/_auth/logout' && request.method === 'POST') {
      return json({ ok: true }, 200, { 'Set-Cookie': tokenCookie('', 0) });
    }
    return await proxy(request, path, url.search);
  } catch (err) {
    return json({ error_message: '代理请求失败', detail: String(err && err.message) }, 502);
  }
}
