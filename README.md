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
| 个人中心 | 登录、消息（评论回复/赞/系统）、我的帖子、我回复的、修改昵称和简介 |
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

## 本地开发

```bash
npm install
```

```bash
npm run dev
```

开发服务器会直接调用 `functions/api/[[path]].js`，行为与线上一致（本地没有边缘缓存）。

> npm 10.8 在解析 peer 依赖时有 bug，仓库里的 `.npmrc` 已设置 `legacy-peer-deps=true` 绕过。

## 部署到 Cloudflare Pages

1. 在 Cloudflare Pages 导入本仓库，构建命令 `npm run build`，输出目录 `dist`
2. `functions/` 目录会被自动识别为 Pages Functions，`/api/*` 由它转发；SPA 路由回退由 Pages 自动处理（`dist` 里没有 404.html）
3. 国内访问较慢，见 [docs/research.md](docs/research.md) 的托管平台对比
