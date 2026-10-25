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

/* ---------- 主页上的外部账号（GitHub、Bangumi、Pickcat） ----------
 * 编程猫没有第三方账号绑定，对应关系存在本站的 KV（绑定名 YM_KV）里：
 *   gh:{编程猫用户ID}  -> { id, login, show, bound_at }             GitHub，走 OAuth 确认身份
 *   bgm:{编程猫用户ID} -> { id, login, nickname, show, bound_at }   Bangumi，走 OAuth 确认身份，login 是 username
 *   pc:{编程猫用户ID}  -> { id, bound_at }                          Pickcat，用户自己填的用户 ID，不做验证
 * 编程猫用户 ID 一律用 httpOnly cookie 里的 token 向编程猫查，不信任前端传来的。
 */
// 公开查询的结果在边缘缓存 5 分钟；任何修改都删掉本机房的缓存，自己马上能看到变化
const LINKS_EDGE_TTL = 300;

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

function linksCacheKey(userId) {
  return new Request(`https://yesmiao.internal/links/${userId}`);
}

async function purgeLinksCache(context, userId) {
  if (edgeCache) context.waitUntil(edgeCache.delete(linksCacheKey(userId)));
}

/* ---------- OAuth 绑定（GitHub、Bangumi） ----------
 * 两家都是标准的 authorization code 流程，差别只在地址、换 token 的格式和读用户信息的接口，写在 OAUTH_PROVIDERS 里。
 * 换到的 access token 只用来读一次用户信息，用完即丢，不保存。
 * 回调地址必须在 /api 下面，因为 ym_token 的 cookie 只在 /api 路径下发送。
 * 接口：/_{name}/start、/_{name}/callback、/_{name}/me、/_{name}/visibility、/_{name}/unbind
 */
// Bangumi 要求带开发者 ID 和应用名的 User-Agent，见 https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md
const OAUTH_USER_AGENT = 'hachimlab/yesmiao (https://github.com/hachimlab/yesmiao)';

const OAUTH_PROVIDERS = {
  github: {
    label: 'GitHub',
    kvPrefix: 'gh',
    stateCookie: 'ym_gh_state',
    clientIdVar: 'GITHUB_CLIENT_ID',
    clientSecretVar: 'GITHUB_CLIENT_SECRET',
    // 不申请任何 scope，只能读公开信息
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    authorizeParams: { allow_signup: 'false' },
    tokenUrl: 'https://github.com/login/oauth/access_token',
    tokenBody: (params) => ({ contentType: 'application/json', body: JSON.stringify(params) }),
    async fetchUser(accessToken) {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': OAUTH_USER_AGENT,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      const u = await res.json().catch(() => null);
      return res.ok && u && u.id && u.login ? { id: u.id, login: u.login } : null;
    },
  },
  // 文档：https://github.com/bangumi/api/blob/master/docs-raw/How-to-Auth.md，scope 尚未实现
  bangumi: {
    label: 'Bangumi',
    kvPrefix: 'bgm',
    stateCookie: 'ym_bgm_state',
    clientIdVar: 'BANGUMI_CLIENT_ID',
    clientSecretVar: 'BANGUMI_CLIENT_SECRET',
    authorizeUrl: 'https://bgm.tv/oauth/authorize',
    authorizeParams: { response_type: 'code' },
    tokenUrl: 'https://bgm.tv/oauth/access_token',
    tokenBody: (params) => ({
      contentType: 'application/x-www-form-urlencoded',
      body: new URLSearchParams({ grant_type: 'authorization_code', ...params }).toString(),
    }),
    async fetchUser(accessToken) {
      const res = await fetch('https://api.bgm.tv/v0/me', {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'User-Agent': OAUTH_USER_AGENT },
      });
      const u = await res.json().catch(() => null);
      // username 初始与 UID 相同，可以改一次；主页链接用 username，显示用昵称
      return res.ok && u && u.id && u.username ? { id: u.id, login: u.username, nickname: u.nickname || u.username } : null;
    },
  },
};

function oauthConfigured(env, p) {
  return !!(env && env.YM_KV && env[p.clientIdVar] && env[p.clientSecretVar]);
}

function oauthStateCookie(name, value, maxAge) {
  return `${OAUTH_PROVIDERS[name].stateCookie}=${value}; Path=/api/_${name}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function readBinding(env, p, userId) {
  return (await env.YM_KV.get(`${p.kvPrefix}:${userId}`, 'json')) || null;
}

async function oauthStart(request, env, name) {
  const p = OAUTH_PROVIDERS[name];
  const origin = new URL(request.url).origin;
  if (!(await codemaoUserId(request))) return redirect(`${origin}/login`);
  const state = crypto.randomUUID();
  const authorize = new URL(p.authorizeUrl);
  authorize.searchParams.set('client_id', env[p.clientIdVar]);
  authorize.searchParams.set('redirect_uri', `${origin}/api/_${name}/callback`);
  authorize.searchParams.set('state', state);
  for (const [k, v] of Object.entries(p.authorizeParams)) authorize.searchParams.set(k, v);
  return redirect(authorize.toString(), { 'Set-Cookie': oauthStateCookie(name, state, 600) });
}

async function oauthCallback(request, env, context, name) {
  const p = OAUTH_PROVIDERS[name];
  const url = new URL(request.url);
  const back = (result) =>
    redirect(`${url.origin}/me/bindings?${name}=${result}`, { 'Set-Cookie': oauthStateCookie(name, '', 0) });
  // 用户在授权页点了取消
  if (url.searchParams.get('error')) return back('denied');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== readCookie(request, p.stateCookie)) return back('expired');
  const userId = await codemaoUserId(request);
  if (!userId) return back('login');

  const { contentType, body } = p.tokenBody({
    client_id: env[p.clientIdVar],
    client_secret: env[p.clientSecretVar],
    code,
    redirect_uri: `${url.origin}/api/_${name}/callback`,
  });
  const tokenRes = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': contentType, 'User-Agent': OAUTH_USER_AGENT },
    body,
  });
  const tokenData = await tokenRes.json().catch(() => null);
  const accessToken = tokenData && tokenData.access_token;
  if (!accessToken) return back('error');
  const account = await p.fetchUser(accessToken);
  if (!account) return back('error');

  // 重新绑定时保留原来的显示设置；第一次绑定默认不显示，由用户自己打开
  const old = await readBinding(env, p, userId);
  await env.YM_KV.put(
    `${p.kvPrefix}:${userId}`,
    JSON.stringify({ ...account, show: old ? !!old.show : false, bound_at: Date.now() }),
  );
  await purgeLinksCache(context, userId);
  return back('bound');
}

async function oauthMine(request, env, name) {
  const p = OAUTH_PROVIDERS[name];
  if (!oauthConfigured(env, p)) return json({ configured: false, binding: null });
  const userId = await codemaoUserId(request);
  if (!userId) return json({ error_message: '请先登录' }, 401);
  return json({ configured: true, binding: await readBinding(env, p, userId) });
}

async function oauthUpdate(request, env, context, name, action) {
  const p = OAUTH_PROVIDERS[name];
  const userId = await codemaoUserId(request);
  if (!userId) return json({ error_message: '请先登录' }, 401);
  if (action === 'unbind') {
    await env.YM_KV.delete(`${p.kvPrefix}:${userId}`);
  } else {
    const body = await request.json().catch(() => ({}));
    const binding = await readBinding(env, p, userId);
    if (!binding) return json({ error_message: `还没有绑定 ${p.label}` }, 404);
    await env.YM_KV.put(`${p.kvPrefix}:${userId}`, JSON.stringify({ ...binding, show: !!body.show }));
  }
  await purgeLinksCache(context, userId);
  return json({ ok: true });
}

async function oauthBinding(request, path, context) {
  const env = context.env || {};
  const method = request.method;
  const [, name, action] = path.match(/^\/_(\w+)\/(\w+)$/) || [];
  const p = OAUTH_PROVIDERS[name];
  if (!p) return json({ error_message: '该接口未开放' }, 404);
  if (action === 'me' && method === 'GET') return oauthMine(request, env, name);
  if (!oauthConfigured(env, p)) return json({ error_message: `本站没有配置 ${p.label} 绑定` }, 503);
  if (action === 'start' && method === 'GET') return oauthStart(request, env, name);
  if (action === 'callback' && method === 'GET') return oauthCallback(request, env, context, name);
  if (action === 'visibility' && method === 'POST') return oauthUpdate(request, env, context, name, 'visibility');
  if (action === 'unbind' && method === 'POST') return oauthUpdate(request, env, context, name, 'unbind');
  return json({ error_message: '该接口未开放' }, 404);
}

/** 公开查询：GitHub、Bangumi 只在用户打开了"在主页显示"时返回；Pickcat 填了就显示 */
async function publicLinks(env, context, userId) {
  if (!env.YM_KV) return { github: null, bangumi: null, pickcat: null };
  const cacheKey = linksCacheKey(userId);
  if (edgeCache) {
    const hit = await edgeCache.match(cacheKey);
    if (hit) return hit.json();
  }
  const { github: gp, bangumi: bp } = OAUTH_PROVIDERS;
  const [gh, bgm, pc] = await Promise.all([
    readBinding(env, gp, userId),
    readBinding(env, bp, userId),
    env.YM_KV.get(`pc:${userId}`, 'json'),
  ]);
  const visible = (p, b) => oauthConfigured(env, p) && b && b.show;
  const links = {
    github: visible(gp, gh) ? gh.login : null,
    bangumi: visible(bp, bgm) ? { username: bgm.login, nickname: bgm.nickname } : null,
    pickcat: pc ? pc.id : null,
  };
  if (edgeCache) {
    const stored = json(links);
    stored.headers.set('Cache-Control', `public, max-age=${LINKS_EDGE_TTL}`);
    context.waitUntil(edgeCache.put(cacheKey, stored));
  }
  return links;
}

/* ---------- Pickcat 绑定 ----------
 * Pickcat 没有开放登录，用户自己填 Pickcat 用户 ID（UUID），主页上链接到 https://pickcat.dao3.fun/profile/{id}。
 * 只检查格式，不验证是不是本人。
 */
const PICKCAT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function pickcat(request, path, context) {
  const env = context.env || {};
  const method = request.method;
  if (path !== '/_pickcat/me' || !['GET', 'POST'].includes(method)) return json({ error_message: '该接口未开放' }, 404);
  if (!env.YM_KV) return method === 'GET' ? json({ configured: false, id: null }) : json({ error_message: '本站没有配置 Pickcat 绑定' }, 503);
  const userId = await codemaoUserId(request);
  if (!userId) return json({ error_message: '请先登录' }, 401);
  if (method === 'GET') {
    const pc = await env.YM_KV.get(`pc:${userId}`, 'json');
    return json({ configured: true, id: pc ? pc.id : null });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body.id !== 'string') return json({ error_message: '请求格式错误' }, 400);
  const id = body.id.trim().toLowerCase();
  // 填空就是解绑
  if (!id) {
    await env.YM_KV.delete(`pc:${userId}`);
  } else {
    if (!PICKCAT_ID_RE.test(id)) return json({ error_message: '用户 ID 格式不对，应为 UUID，例如 123e4567-e89b-12d3-a456-426614174000' }, 400);
    await env.YM_KV.put(`pc:${userId}`, JSON.stringify({ id, bound_at: Date.now() }));
  }
  await purgeLinksCache(context, userId);
  return json({ configured: true, id: id || null });
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
    if (path.startsWith('/_pickcat/')) return await pickcat(request, path, context);
    const linksMatch = path.match(/^\/_links\/u\/(\d+)$/);
    if (linksMatch && request.method === 'GET') return json(await publicLinks(context.env || {}, context, linksMatch[1]));
    // 旧版前端用的 GitHub 公开查询地址，PWA 里缓存的旧页面还会请求一阵子
    const legacyMatch = path.match(/^\/_github\/u\/(\d+)$/);
    if (legacyMatch && request.method === 'GET') return json({ login: (await publicLinks(context.env || {}, context, legacyMatch[1])).github });
    if (/^\/_(github|bangumi)\//.test(path)) return await oauthBinding(request, path, context);
    return await proxy(request, path, url.search, context);
  } catch (err) {
    return json({ error_message: '代理请求失败', detail: String(err && err.message) }, 502);
  }
}
