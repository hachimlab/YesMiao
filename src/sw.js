// Service Worker：构建时由 vite.config.ts 的 serviceWorker() 插件填入 VERSION 和 PRECACHE，输出到 dist/sw.js。
// 开发环境不注册。
// - 页面骨架（index.html）和打包出的 JS/CSS 预缓存，打开应用不等网络，断网也能进
// - /api/* 不经过这里：数据的离线缓存由 React Query 持久化负责，登录状态也不该被缓存
// - 跨域图片（头像、封面）不缓存：no-cors 响应在配额里按很大的体积计算，容易把存储撑满

const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const CACHE = 'yesmiao-' + VERSION;
const SHELL = '/';

// 浏览器拒绝用重定向得来的响应回应导航（报 ERR_FAILED），万一托管平台又加了重定向，重新包一层去掉标记
function unredirect(res) {
  return res && res.redirected ? new Response(res.body, res) : res;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // index.html 跳过 HTTP 缓存，确保拿到这次发版的；带哈希的资源走 HTTP 缓存，没变的依赖包不用重新下载
      cache.addAll(PRECACHE.map((url) => (url === SHELL ? new Request(url, { cache: 'no-cache' }) : url))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('yesmiao-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 页面点了“刷新”才切换到新版本，避免正在写的回帖被打断
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate' && !/\.\w+$/.test(url.pathname)) {
    // SPA 的所有路由都是同一个 index.html；带扩展名的（直接打开 robots.txt 之类）照常走网络
    event.respondWith(caches.match(SHELL, { cacheName: CACHE }).then((res) => unredirect(res) || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { cacheName: CACHE }).then((res) => res || fetch(req)));
});
