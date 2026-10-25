import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// 本地开发直接复用线上的 Pages Function，保证行为一致
import { onRequest as apiFunction } from './functions/api/[[path]].js';
import { onRequest as rssFunction } from './functions/rss/[[path]].js';

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

type PagesFunction = (context: { request: Request }) => Promise<Response>;

const FUNCTIONS: [string, PagesFunction][] = [
  ['/api', apiFunction],
  ['/rss', rssFunction],
];

function edgeProxy(): Plugin {
  return {
    name: 'yesmiao-edge-proxy',
    configureServer(server) {
      for (const [prefix, onRequest] of FUNCTIONS) {
        server.middlewares.use(prefix, async (req, res) => {
          const url = new URL(prefix + (req.url || ''), `http://${req.headers.host}`);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const hasBody = !['GET', 'HEAD'].includes(req.method || 'GET');
          const request = new Request(url, {
            method: req.method,
            headers,
            body: hasBody ? new Uint8Array(await readBody(req)) : undefined,
          });
          const response: Response = await onRequest({ request });
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        });
      }
    },
  };
}

// 除了打包产物，这些 public 文件也预缓存（页面里直接用到的）。安装用的大图标只在安装时取一次，不占缓存
const PRECACHE_PUBLIC = ['/logo.png', '/favicon.png', '/manifest.webmanifest'];

/** 构建结束后把 src/sw.js 填上预缓存清单写到 dist/sw.js；版本号取这些文件内容的哈希，没变就不会触发更新 */
function serviceWorker(): Plugin {
  return {
    name: 'yesmiao-sw',
    apply: 'build',
    writeBundle(options, bundle) {
      const dir = options.dir!;
      // 页面骨架用 / 而不是 /index.html：Cloudflare Pages 会把 /index.html 308 到 /，带重定向的响应不能拿来回应导航
      const files = [
        '/',
        ...Object.keys(bundle)
          .filter((f) => f.startsWith('assets/'))
          .map((f) => '/' + f),
        ...PRECACHE_PUBLIC,
      ];
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(dir, f === '/' ? 'index.html' : f)));
      const source = readFileSync(fileURLToPath(new URL('./src/sw.js', import.meta.url)), 'utf8')
        .replace('__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__PRECACHE__', JSON.stringify(files));
      writeFileSync(join(dir, 'sw.js'), source);
    },
  };
}

export default defineConfig({
  plugins: [react(), edgeProxy(), serviceWorker()],
  build: {
    rolldownOptions: {
      // 第三方库单独打包：发版时只改业务代码，浏览器里缓存的依赖包（immutable）可以继续用
      output: { codeSplitting: { groups: [{ name: 'vendor', test: /node_modules/ }] } },
    },
  },
});
