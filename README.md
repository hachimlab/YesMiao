# YesMiao

编程猫社区（shequ.codemao.cn）的第三方前端。官方页面已跳转到升级公告，但 `api.codemao.cn` 仍在运行，YesMiao 直接复用这些接口，重新提供论坛、作品和个人中心。

接口调研、托管方案对比见 [docs/research.md](docs/research.md)。

## 功能

| 模块 | 页面 |
| --- | --- |
| 论坛 | 板块列表、板块帖子（最新/精选）、全站精选、帖子详情（回帖 + 楼中楼回复）、标题搜索、发帖、回帖、回复、点赞、删除自己的帖子 |
| 作品 | 发现页（精选/热门/最多点击/最新）、作品详情（内嵌官方播放器运行）、作品介绍与操作说明、标签、评论与回复、点赞、收藏、相关作品 |
| 用户 | 用户主页（作品/收藏/粉丝/关注）、关注 |
| 搜索 | 讨论（按标题）、作品（按作品名）、用户（按昵称，数据来自 [CodemaoUserDB](https://github.com/hachimlab/UserDB)） |
| 个人中心 | 登录、消息（评论回复/赞/系统）、我的帖子、我回复的、修改昵称和简介、绑定 GitHub（可选在主页显示） |
| 外观设置 | 浅色/深色/跟随系统、主题色、正文字号/行距/衬线、显示密度、圆角、作品布局、背景图、毛玻璃顶栏、动效、隐藏头像和计数、屏蔽用户和关键词、自定义 CSS（网址加 `?nostyle` 进安全模式）、导入导出。只存在本机浏览器，不需要登录 |
| RSS | 全站精选、求助、各板块最新/精选、用户作品、最新作品。对应页面的工具栏上有 RSS 按钮，点击复制订阅地址，浏览器的 RSS 扩展也能自动发现 |
| PWA | 可安装到桌面/主屏幕（独立窗口、顶栏补返回键、适配刘海屏）；页面骨架和代码预缓存，秒开、断网也能看之前浏览过的内容；发新版后提示刷新 |

## 结构

```
functions/api/[[path]].js          API 代理（Cloudflare Pages Function），/api/* → api.codemao.cn/*
functions/rss/[[path]].js          RSS 订阅源（Cloudflare Pages Function），/rss/*.xml
src/api/                           接口封装与类型
src/pages/                         页面（forum / works / user / me）
src/components/                    通用组件
src/sw.js                          Service Worker 模板，构建时填入预缓存清单输出为 dist/sw.js（开发环境不注册）
public/_headers                    静态资源的缓存头（Cloudflare Pages）
```

为什么需要代理：编程猫 API 只允许 `*.codemao.cn` 跨域访问，浏览器无法直接调用。代理还负责：

- 只放行站点用到的接口（白名单），不做开放代理
- 登录后把 token 存在本站的 httpOnly Cookie 里，页面脚本拿不到；转发时以 `authorization` Cookie 的形式发给编程猫
- 未登录的读请求：浏览器缓存 30 秒（`Cache-Control: private, max-age=30`），并存进 Cloudflare 边缘缓存 60 秒，同一机房的访客共享，减少打到编程猫的请求；响应头 `X-Cache: HIT/MISS` 表示是否命中。登录后的请求和非 200 响应都不缓存

## RSS

| 地址 | 内容 |
| --- | --- |
| `/rss/featured.xml` | 全站精选 |
| `/rss/help.xml` | 求助 |
| `/rss/t/{板块ID}.xml` | 板块最新 |
| `/rss/t/{板块ID}/featured.xml` | 板块精选 |
| `/rss/u/{用户ID}.xml` | 用户发布的作品 |
| `/rss/works.xml` | 最新作品（接口没有发布时间，阅读器按抓取时间排序） |

每个源取最新 20 条，只读未登录可见的数据。帖子列表接口只返回前 1000 个字符的正文，所以条目里是首图 + 纯文本摘要，附原帖链接。生成结果在 Cloudflare 边缘缓存 10 分钟（缓存键忽略查询参数），阅读器频繁刷新也不会多打编程猫。

编程猫没有按昵称找人的接口，用户搜索调用 HachimLab 的 [CodemaoUserDB](https://github.com/hachimlab/UserDB)（`udbapi.hachimlab.top`，允许跨域，浏览器直接请求，不经过代理）。和它的油猴插件一样，打开用户主页时会把该用户同步进库（同一用户 10 分钟一次），让更多人能被搜到。

## GitHub 绑定

编程猫没有第三方账号绑定，绑定关系存在本站的 Cloudflare KV 里（`gh:{编程猫用户ID}` → GitHub 数字 ID、用户名、是否在主页显示），只用来在用户主页显示 GitHub 账号。

- 编程猫身份：代理用 httpOnly cookie 里的登录 token 向 `/web/users/details` 查询，不信任前端传来的用户 ID
- GitHub 身份：OAuth 授权，不申请任何 scope；换到的 access token 只读一次 `/user`，用完即丢
- 绑定后默认不显示，用户在「个人中心 → 设置」里打开「在我的主页显示」
- 公开查询 `/api/_github/u/{用户ID}` 在边缘缓存 5 分钟；绑定、解绑、切换显示时删掉本机房的缓存
- 没有配置 KV 或 OAuth App 时，设置页不显示这一块，主页也不查

| 接口 | 作用 |
| --- | --- |
| `GET /api/_github/start` | 跳转到 GitHub 授权页 |
| `GET /api/_github/callback` | 授权回调，确认两边身份后写入 KV，跳回设置页 |
| `GET /api/_github/me` | 当前用户的绑定（需登录） |
| `POST /api/_github/visibility` | 切换是否在主页显示（需登录） |
| `POST /api/_github/unbind` | 解绑（需登录） |
| `GET /api/_github/u/{用户ID}` | 公开查询，只在用户选择显示时返回 GitHub 用户名 |

## 本地开发

```bash
npm install
```

```bash
npm run dev
```

开发服务器会直接调用 `functions/api/[[path]].js`，行为与线上一致（本地没有边缘缓存）。

本地调试 GitHub 绑定：另建一个回调地址为 `http://localhost:5173/api/_github/callback` 的 OAuth App，把 id 和 secret 写进 `.env.local`（`GITHUB_CLIENT_ID=…`、`GITHUB_CLIENT_SECRET=…`）。本地用内存代替 KV，重启 dev server 后绑定会清空。

> npm 10.8 在解析 peer 依赖时有 bug，仓库里的 `.npmrc` 已设置 `legacy-peer-deps=true` 绕过。

## 部署到 Cloudflare Pages

1. 在 Cloudflare Pages 导入本仓库，构建命令 `npm run build`，输出目录 `dist`
2. `functions/` 目录会被自动识别为 Pages Functions，`/api/*` 由它转发；SPA 路由回退由 Pages 自动处理（`dist` 里没有 404.html）
3. GitHub 绑定（可选）：
   - 在 GitHub → Settings → Developer settings → OAuth Apps 新建应用，Authorization callback URL 填 `https://你的域名/api/_github/callback`
   - Pages 项目 → 设置 → 绑定：添加 KV 命名空间，变量名 `YM_KV`
   - Pages 项目 → 设置 → 变量和机密：添加 `GITHUB_CLIENT_ID`，以及类型为「密钥」的 `GITHUB_CLIENT_SECRET`
   - 重新部署后生效
4. 国内访问较慢，见 [docs/research.md](docs/research.md) 的托管平台对比
