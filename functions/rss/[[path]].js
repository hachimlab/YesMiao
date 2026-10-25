// YesMiao RSS：/rss/*.xml -> 读编程猫公开接口，输出 RSS 2.0。
// 运行在 Cloudflare Pages Functions 上，本地开发时由 vite.config.ts 直接调用同一个 onRequest。
// 只读未登录可见的数据，不带 Cookie；生成结果放进 Cloudflare 边缘缓存，阅读器频繁轮询也不会打到编程猫。
// 地址都带 .xml 扩展名：Service Worker 只把不带扩展名的导航交给单页应用，带扩展名的照常走网络

const UPSTREAM = 'https://api.codemao.cn';
const TTL = 600;
const LIMIT = 20;
// 帖子列表接口把正文截成 1000 个字符，达到这个长度就当作没显示完
const CONTENT_CUT = 990;

const edgeCache = typeof caches !== 'undefined' ? caches.default : undefined;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function get(path, query = {}) {
  const url = new URL(UPSTREAM + path);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    },
  });
  // 不存在的用户返回 422，不存在的板块返回 404
  if ([400, 404, 422].includes(res.status)) throw new HttpError(404, '找不到这个订阅源');
  if (!res.ok) throw new HttpError(502, `编程猫接口返回 ${res.status}`);
  return res.json();
}

/* ---------- 文本处理 ---------- */

const escapeXml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** 帖子 HTML 转纯文本：段落和换行保留为换行，其余标签去掉 */
function htmlToText(html) {
  return String(html || '')
    .replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]*>?/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}

function firstImage(html) {
  const m = String(html || '').match(/<img[^>]+src="(https?:\/\/[^"]+)"/i);
  return m && !m[1].includes('/emoji/') ? m[1] : undefined;
}

/** 阅读器里显示的 HTML：图片 + 按行分段的纯文本，原文的样式和脚本一概不带 */
function summaryHtml({ image, text, more }) {
  const parts = [];
  if (image) parts.push(`<p><img src="${escapeXml(image)}" referrerpolicy="no-referrer"></p>`);
  for (const line of String(text || '').split('\n')) if (line.trim()) parts.push(`<p>${escapeXml(line)}</p>`);
  if (more) parts.push(`<p><a href="${escapeXml(more)}">查看讨论 →</a></p>`);
  return parts.join('');
}

/* ---------- RSS ---------- */

function rss({ self, title, link, description, items }) {
  const now = new Date().toUTCString();
  const body = items
    .map((it) =>
      [
        '<item>',
        `<title>${escapeXml(it.title)}</title>`,
        `<link>${escapeXml(it.link)}</link>`,
        `<guid isPermaLink="true">${escapeXml(it.link)}</guid>`,
        it.author ? `<dc:creator>${escapeXml(it.author)}</dc:creator>` : '',
        it.category ? `<category>${escapeXml(it.category)}</category>` : '',
        it.time ? `<pubDate>${new Date(it.time * 1000).toUTCString()}</pubDate>` : '',
        `<description>${escapeXml(it.html)}</description>`,
        '</item>',
      ]
        .filter(Boolean)
        .join(''),
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${escapeXml(title)}</title>
<link>${escapeXml(link)}</link>
<description>${escapeXml(description)}</description>
<language>zh-CN</language>
<lastBuildDate>${now}</lastBuildDate>
<ttl>${TTL / 60}</ttl>
<atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>
${body}
</channel>
</rss>
`;
}

function postItems(origin, posts, board) {
  return [...posts]
    .sort((a, b) => b.created_at - a.created_at)
    .map((p) => {
      const link = `${origin}/d/${p.id}`;
      return {
        title: p.title,
        link,
        author: p.user?.nickname,
        category: board ?? p.board_name,
        time: p.created_at,
        html: summaryHtml({
          image: firstImage(p.content),
          text: htmlToText(p.content) + (p.content.length >= CONTENT_CUT ? '…' : ''),
          more: link,
        }),
      };
    });
}

/* ---------- 订阅源 ---------- */

const FEEDS = [
  {
    re: /^\/featured\.xml$/,
    build: async (origin) => {
      const d = await get('/web/forums/posts/selections', { offset: 0, limit: LIMIT });
      return {
        title: 'YesMiao · 全站精选',
        link: `${origin}/?sort=selection`,
        description: '编程猫社区的精选讨论',
        items: postItems(origin, d.items),
      };
    },
  },
  {
    re: /^\/help\.xml$/,
    build: async (origin) => {
      const d = await get('/web/forums/boards/posts/ask-help', { page: 1, limit: LIMIT });
      return {
        title: 'YesMiao · 求助',
        link: `${origin}/?sort=help`,
        description: '编程猫社区的求助帖',
        items: postItems(origin, d.items),
      };
    },
  },
  {
    re: /^\/t\/(\d+)(\/featured)?\.xml$/,
    build: async (origin, [, id, featured]) => {
      const [board, d] = await Promise.all([
        get(`/web/forums/boards/${id}`),
        featured
          ? get('/web/forums/posts/selections', { board_id: id, offset: 0, limit: LIMIT })
          : get(`/web/forums/boards/${id}/posts`, { page: 1, limit: LIMIT }),
      ]);
      return {
        title: `YesMiao · ${board.name}${featured ? ' · 精选' : ''}`,
        link: `${origin}/t/${id}${featured ? '?sort=selection' : ''}`,
        description: board.description || `编程猫社区「${board.name}」板块`,
        items: postItems(origin, d.items, board.name),
      };
    },
  },
  {
    re: /^\/u\/(\d+)\.xml$/,
    build: async (origin, [, id]) => {
      const [honor, d] = await Promise.all([
        get('/creation-tools/v1/user/center/honor', { user_id: id }),
        get('/creation-tools/v2/user/center/work-list', { user_id: id, offset: 0, limit: LIMIT }),
      ]);
      if (!honor.nickname) throw new HttpError(404, '找不到这个用户');
      return {
        title: `YesMiao · ${honor.nickname} 的作品`,
        link: `${origin}/u/${id}`,
        description: honor.user_description || `${honor.nickname} 在编程猫发布的作品`,
        items: d.items.map((w) => ({
          title: w.work_name,
          link: `${origin}/work/${w.id}`,
          author: honor.nickname,
          time: w.publish_time,
          html: summaryHtml({ image: w.preview, text: w.description }),
        })),
      };
    },
  },
  {
    re: /^\/works\.xml$/,
    build: async (origin) => {
      // 这个接口不返回发布时间，阅读器会按首次抓到的时间排序
      const d = await get('/creation-tools/v1/pc/discover/newest-work', { offset: 0, limit: LIMIT });
      return {
        title: 'YesMiao · 最新作品',
        link: `${origin}/works?feed=newest`,
        description: '编程猫社区最新发布的作品',
        items: d.items.map((w) => ({
          title: w.work_name,
          link: `${origin}/work/${w.work_id}`,
          author: w.nickname,
          html: summaryHtml({ image: w.preview_url, text: `作者：${w.nickname}` }),
        })),
      };
    },
  },
];

function text(message, status) {
  return new Response(message + '\n', {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequest(context) {
  const { request } = context;
  if (!['GET', 'HEAD'].includes(request.method)) return text('只支持 GET', 405);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/rss/, '');
  const feed = FEEDS.map((f) => ({ f, m: path.match(f.re) })).find((x) => x.m);
  if (!feed) return text('找不到这个订阅源', 404);

  // 查询参数不影响输出，缓存键里去掉，免得被人用 ?随机数 绕过缓存
  const cacheKey = edgeCache && new Request(url.origin + url.pathname);
  if (cacheKey) {
    const hit = await edgeCache.match(cacheKey);
    if (hit) return hit;
  }

  let channel;
  try {
    channel = await feed.f.build(url.origin, feed.m);
  } catch (err) {
    return text(err instanceof HttpError ? err.message : '生成订阅源失败', err instanceof HttpError ? err.status : 502);
  }
  const res = new Response(rss({ self: url.origin + url.pathname, ...channel }), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${TTL}`,
    },
  });
  if (cacheKey) context.waitUntil(edgeCache.put(cacheKey, res.clone()));
  return res;
}
