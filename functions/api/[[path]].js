// YesMiao API 代理：浏览器 -> /api/* -> https://api.codemao.cn/*
// 编程猫 API 只允许 *.codemao.cn 跨域，所以所有请求都经由这里转发。
// 运行在 Cloudflare Pages Functions 上，本地开发时由 vite.config.ts 直接调用同一个 onRequest。

const UPSTREAM = 'https://api.codemao.cn';
const TOKEN_COOKIE = 'ym_token';
const TOKEN_MAX_AGE = 60 * 60 * 24 * 30;
const COMMUNITY_PID = '65edCTyg';
// 未登录的读请求：浏览器缓存 30 秒，Cloudflare 边缘缓存 60 秒（同一机房的访客共享，少打编程猫）
const BROWSER_TTL = 30;
const EDGE_TTL = 60;

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

function readCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

function readToken(request) {
  return readCookie(request, TOKEN_COOKIE);
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

// 本地开发（Node）没有 caches，直接跳过边缘缓存
const edgeCache = typeof caches !== 'undefined' ? caches.default : undefined;

function withBrowserCache(res, cacheStatus) {
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', `private, max-age=${BROWSER_TTL}`);
  out.headers.set('X-Cache', cacheStatus);
  return out;
}

async function proxy(request, path, search, context) {
  if (!ALLOWED.some((re) => re.test(path))) {
    return json({ error_message: '该接口未开放' }, 403);
  }
  const token = readToken(request);
  const method = request.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);

  // 登录态的数据（is_liked 之类）每个人不同，只缓存未登录的 GET；缓存键只有网址，不带 Cookie
  const cacheKey = edgeCache && method === 'GET' && !token ? new Request(`${UPSTREAM}${path}${search}`) : undefined;
  if (cacheKey) {
    const hit = await edgeCache.match(cacheKey);
    if (hit) return withBrowserCache(hit, 'HIT');
  }

  const res = await fetch(`${UPSTREAM}${path}${search}`, {
    method,
    headers: upstreamHeaders(token, request.headers.get('content-type')),
    body: hasBody ? await request.text() : undefined,
    redirect: 'manual',
  });

  const headers = new Headers();
  const contentType = res.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  // 登录态的数据不能被任何缓存保存；未登录的读请求让浏览器缓存 30 秒，省函数调用次数
  headers.set('Cache-Control', method === 'GET' && !token ? `private, max-age=${BROWSER_TTL}` : 'no-store');
  if (res.status === 401 && token) headers.set('Set-Cookie', tokenCookie('', 0));

  const noBody = res.status === 204 || res.status === 304 || method === 'HEAD';
  const out = new Response(noBody ? null : res.body, { status: res.status, headers });
  // 只存成功的响应，出错不缓存，免得一次失败卡住 60 秒
  if (cacheKey && res.status === 200) {
    const stored = out.clone();
    stored.headers.set('Cache-Control', `public, max-age=${EDGE_TTL}`);
    context.waitUntil(edgeCache.put(cacheKey, stored));
    out.headers.set('X-Cache', 'MISS');
  }
  return out;
}

/* ---------- GitHub 绑定 ----------
 * 编程猫没有第三方账号绑定，对应关系存在本站的 KV（绑定名 YM_KV）里：gh:{编程猫用户ID} -> { id, login, show, bound_at }。
 * 两边身份都在服务端确认：编程猫用户 ID 用 httpOnly cookie 里的 token 向编程猫查，GitHub 账号走 OAuth。
 * OAuth 不申请任何 scope，换到的 access token 只用来读一次 /user，用完即丢，不保存。
 * 回调地址必须在 /api 下面，因为 ym_token 的 cookie 只在 /api 路径下发送。
 */
const GH_STATE_COOKIE = 'ym_gh_state';
// 公开查询的结果在边缘缓存 5 分钟；绑定、解绑、切换显示时删掉本机房的缓存，自己马上能看到变化
const GH_EDGE_TTL = 300;

function githubConfigured(env) {
  return !!(env && env.YM_KV && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

function stateCookie(value, maxAge) {
  return `${GH_STATE_COOKIE}=${value}; Path=/api/_github; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function redirect(location, extraHeaders = {}) {
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...extraHeaders } });
}

/** 用登录 token 向编程猫确认当前用户，没登录或 token 失效返回 '' */
async function codemaoUserId(request) {
  const token = readToken(request);
  if (!token) return '';
  const res = await fetch(`${UPSTREAM}/web/users/details`, { headers: upstreamHeaders(token) });
  if (!res.ok) return '';
  const data = await res.json().catch(() => null);
  return data && data.id ? String(data.id) : '';
}

function githubCacheKey(userId) {
  return new Request(`https://yesmiao.internal/github/${userId}`);
}

async function purgeGithubCache(context, userId) {
  if (edgeCache) context.waitUntil(edgeCache.delete(githubCacheKey(userId)));
}

async function readBinding(env, userId) {
  return (await env.YM_KV.get(`gh:${userId}`, 'json')) || null;
}

async function githubStart(request, env) {
  const origin = new URL(request.url).origin;
  if (!(await codemaoUserId(request))) return redirect(`${origin}/login`);
  const state = crypto.randomUUID();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${origin}/api/_github/callback`);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('allow_signup', 'false');
  return redirect(authorize.toString(), { 'Set-Cookie': stateCookie(state, 600) });
}

async function githubCallback(request, env, context) {
  const url = new URL(request.url);
  const back = (result) => redirect(`${url.origin}/me/settings?github=${result}`, { 'Set-Cookie': stateCookie('', 0) });
  // 用户在 GitHub 上点了取消
  if (url.searchParams.get('error')) return back('denied');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== readCookie(request, GH_STATE_COOKIE)) return back('expired');
  const userId = await codemaoUserId(request);
  if (!userId) return back('login');

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/_github/callback`,
    }),
  });
  const tokenData = await tokenRes.json().catch(() => null);
  const accessToken = tokenData && tokenData.access_token;
  if (!accessToken) return back('error');

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'YesMiao',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const gh = await userRes.json().catch(() => null);
  if (!userRes.ok || !gh || !gh.id || !gh.login) return back('error');

  // 重新绑定时保留原来的显示设置；第一次绑定默认不显示，由用户自己打开
  const old = await readBinding(env, userId);
  await env.YM_KV.put(
    `gh:${userId}`,
    JSON.stringify({ id: gh.id, login: gh.login, show: old ? !!old.show : false, bound_at: Date.now() }),
  );
  await purgeGithubCache(context, userId);
  return back('bound');
}

async function githubMine(request, env) {
  if (!githubConfigured(env)) return json({ configured: false, binding: null });
  const userId = await codemaoUserId(request);
  if (!userId) return json({ error_message: '请先登录' }, 401);
  return json({ configured: true, binding: await readBinding(env, userId) });
}

async function githubUpdate(request, env, context, action) {
  const userId = await codemaoUserId(request);
  if (!userId) return json({ error_message: '请先登录' }, 401);
  if (action === 'unbind') {
    await env.YM_KV.delete(`gh:${userId}`);
  } else {
    const body = await request.json().catch(() => ({}));
    const binding = await readBinding(env, userId);
    if (!binding) return json({ error_message: '还没有绑定 GitHub' }, 404);
    await env.YM_KV.put(`gh:${userId}`, JSON.stringify({ ...binding, show: !!body.show }));
  }
  await purgeGithubCache(context, userId);
  return json({ ok: true });
}

/** 公开查询：只有用户打开了"在主页显示"才返回 GitHub 用户名 */
async function githubPublic(env, context, userId) {
  if (!githubConfigured(env)) return json({ login: null });
  const cacheKey = githubCacheKey(userId);
  if (edgeCache) {
    const hit = await edgeCache.match(cacheKey);
    if (hit) return new Response(hit.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Cache': 'HIT' } });
  }
  const binding = await readBinding(env, userId);
  const out = json({ login: binding && binding.show ? binding.login : null });
  if (edgeCache) {
    const stored = out.clone();
    stored.headers.set('Cache-Control', `public, max-age=${GH_EDGE_TTL}`);
    context.waitUntil(edgeCache.put(cacheKey, stored));
  }
  return out;
}

async function github(request, path, context) {
  const env = context.env || {};
  const method = request.method;
  if (path === '/_github/me' && method === 'GET') return githubMine(request, env);
  const publicMatch = path.match(/^\/_github\/u\/(\d+)$/);
  if (publicMatch && method === 'GET') return githubPublic(env, context, publicMatch[1]);
  if (!githubConfigured(env)) return json({ error_message: '本站没有配置 GitHub 绑定' }, 503);
  if (path === '/_github/start' && method === 'GET') return githubStart(request, env);
  if (path === '/_github/callback' && method === 'GET') return githubCallback(request, env, context);
  if (path === '/_github/visibility' && method === 'POST') return githubUpdate(request, env, context, 'visibility');
  if (path === '/_github/unbind' && method === 'POST') return githubUpdate(request, env, context, 'unbind');
  return json({ error_message: '该接口未开放' }, 404);
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
    if (path.startsWith('/_github/')) return await github(request, path, context);
    return await proxy(request, path, url.search, context);
  } catch (err) {
    return json({ error_message: '代理请求失败', detail: String(err && err.message) }, 502);
  }
}
