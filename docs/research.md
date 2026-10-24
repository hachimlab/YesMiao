# 编程猫社区结构调研（2026-10-24）

本文记录对 shequ.codemao.cn 及其 API 的调研结果，作为 YesMiao 新前端的设计依据。
接口来源：[codemao-api 文档](https://codemao.lambdark.com/)（[GitHub](https://github.com/lambdark/codemao-api)，已停更）+ 官方前端 JS bundle 反查 + curl 实测。

## 1. 关键结论

| 问题 | 结论 | 影响 |
| --- | --- | --- |
| API 是否可用 | 可用。`api.codemao.cn` 返回实时数据，最新帖子时间在 2026 年 6 月 | 可以直接复用全部数据 |
| CORS | 只放行 `*.codemao.cn` 来源；`localhost`、其它域名的预检返回 **403** | **浏览器不能直连 API，必须自建后端代理（BFF）** |
| 认证方式 | 登录返回 `auth.token`；官方前端把它存为 `authorization` cookie，请求时放在 `authorization` 请求头里（原始 token，不带 `Bearer`） | 代理在自己的域名下用 httpOnly cookie 保存 token，转发时补上请求头 |
| 登录 | `POST /tiger/v3/web/accounts/login`，`pid=65edCTyg`（社区）。用不存在的账号测试，返回 `AC3_2 用户不存在或者密码错误`，没有触发验证码 | 真实账号登录是否会触发极验/腾讯验证码（`/login/security`、`/captcha/*`）**尚未验证** |
| 图片 | `static.codemao.cn`、`cdn-community.bcmcdn.com` 不校验 Referer | 头像和帖子图片可以直接外链 |
| 帖子内容 | 富文本 HTML（含内联样式、表情 `<img>`） | 渲染前必须做 HTML 白名单过滤，防 XSS |
| 分页限制 | 大多数列表要求 `limit` 在 **5–30** 之间，否则返回 400 | 前端分页大小固定在这个范围内 |
| 跳转公告 | 页面壳和 JS 仍可访问，跳转逻辑在客户端；首页 banner 指向"新社区内测 cdsq.dao3.fun" | 与本项目无关，自建前端不受影响 |

## 2. 论坛数据模型

```
板块 board ──< 帖子 post ──< 回帖 reply ──< 回复 comment（可 parent_id 指向另一条回复）
```

- **帖子** `post`：`id, user, title, content(HTML), board_id, board_name, n_views, n_replies, n_comments, created_at, updated_at`，标记位：`is_authorized`(官方) `is_featured`(精选) `is_hotted`(热门) `is_pinned`(置顶) `tutorial_flag`(教程) `ask_help_flag`(求助)
- **回帖** `reply`：`id, user, content(HTML), n_likes, is_liked, is_top, n_comments, created_at, earliest_comments[]`（列表里自带前几条回复）
- **回复** `comment`：`id, user, content(纯文本), n_likes, is_liked, reply_user{id,nickname}?, created_at`
- **用户摘要** `user`：`id, nickname, avatar_url, subject_id(工作室ID), work_shop_name, work_shop_level, has_signed`
- 列表返回统一结构：`{ items, offset, limit, total, counted }`
- ID 一律为字符串，时间戳为秒

## 3. 论坛接口（Base `https://api.codemao.cn`）

✅ = 已实测可用；🔒 = 需要登录；📄 = 文档未收录，从官方 bundle 反查

### 读

| 接口 | 说明 |
| --- | --- |
| ✅ `GET /web/forums/boards/simples/all` | 所有板块（当前 15 个左右，含 奇咔Qikka、KN创作、积木编程乐园、Python乐园…） |
| ✅ `GET /web/forums/boards/<board_id>` | 板块详情（`description, n_posts, n_discussions`） |
| ✅📄 `GET /web/forums/boards/<board_id>/posts?page=&limit=` | **板块帖子列表**（积木编程乐园 total=77681） |
| ✅📄 `GET /web/forums/posts/selections?board_id=&offset=&limit=` | 精选帖（不传 board_id 即全站） |
| 📄 `GET /web/forums/posts/popularity?...` / `boards/<id>/posts/popularity?limit=` | 人气帖 |
| ✅📄 `GET /web/forums/posts/hots/all` | 热门帖 **ID 列表**，配合下面的批量接口使用 |
| 📄 `GET /web/forums/posts/all?ids=1,2,3` | 按 ID 批量取帖子 |
| 📄 `GET /web/forums/boards/posts/7dayHot?` / `boards/posts/ask-help?page=` | 7 日热门 / 求助帖 |
| ✅ `GET /web/forums/notice-boards?limit=` | 公告栏 |
| ✅ `GET /web/forums/posts/search?title=&board_id=&page=&limit=` | 标题搜索 |
| ✅ `GET /web/forums/posts/<post_id>/details` | 帖子详情 |
| ✅📄 `GET /web/forums/posts/<post_id>/replies?page=&limit=&sort=` | **回帖列表**，`sort` 可取 `-created_at` / `-n_likes` |
| ✅📄 `GET /web/forums/replies/<reply_id>/comments?page=&limit=` | 某条回帖下的回复 |
| 🔒📄 `GET /web/forums/posts/mine/created?page=` / `mine/replied?page=` | 我发的帖 / 我回的帖 |

### 写（均 🔒）

| 接口 | 说明 |
| --- | --- |
| `POST /web/forums/boards/<board_id>/posts` `{title, content, studio_id?}` | 发帖（**账号需绑定手机号**），成功 201 |
| `POST /web/forums/posts/<post_id>/replies` `{content}` | 回帖，201 |
| `POST /web/forums/replies/<reply_id>/comments` `{content, parent_id}` | 回复，201 |
| `DELETE /web/forums/posts/<id>` · `DELETE /web/forums/replies/<id>` · `DELETE /web/forums/comments/<id>` | 删除，204 |
| `PUT/DELETE /web/forums/comments/<id>/liked?source=REPLY\|COMMENT` | 点赞 / 取消点赞（回帖和回复共用此路径） |
| `PUT/DELETE /web/forums/replies/<id>/top` | 置顶回帖（楼主权限） |
| `POST /web/reports/posts` `{post_id, reason_id, description}` · `POST /web/reports/posts/discussions` · `POST /web/reports/comments` | 举报；原因列表 `GET /web/reports/posts/reasons/all` |

### 发布限制

官方前端（`cdn-community.codemao.cn/community_frontend/` 的 bundle）在发布前做的校验，YesMiao 在 `src/lib/limits.ts` 里照搬。字数按 JS 字符串长度算。

| 场景 | 字数 | 每日次数（`opr/limit` 键） |
| --- | --- | --- |
| 发帖 | 标题 5–50；正文纯文本 ≥ 10（含图片可少于 10），HTML ≤ 50000 | 5（`forum_post`） |
| 回帖 | 纯文本 ≥ 2（含图片可少于 2），HTML ≤ 9000 | 10（`forum_reply_post`） |
| 论坛楼中楼 | 2–200 | 10（`forum_comment`） |
| 作品评论 | 非空，输入框限 200 | 10（`work_comment`） |
| 作品评论的回复 | 2–200 | 与作品评论共用 `work_comment` |

- 次数文案来自 ✅ `GET /web/config/opr/limit/toast/text`（不需登录），只是提示文字，计数在服务端；官方前端把它显示在发布按钮下方
- 发帖、回帖、评论都要求账号已绑定手机号并签过社区协议，否则官方前端会先弹出绑定/签协议流程

## 4. 社区其它模块（后续阶段）

| 模块 | 主要接口 |
| --- | --- |
| 账号 | `POST /tiger/v3/web/accounts/login` · `/logout` · `/tokens/refresh` · `GET /web/users/details` 🔒 · `PATCH /tiger/v3/web/accounts/info` 🔒 |
| 用户主页 | ✅ `GET /api/user/info/detail/<user_id>` · `/creation-tools/v2/user/center/work-list` · `/creation-tools/v1/user/fans` · `/followers` · `/user/center/honor` · `POST /nemo/v2/user/<id>/follow` 🔒 |
| 消息 | `GET /web/message-record/count` 🔒 · `GET /web/message-record?query_type=...` 🔒 |
| 作品 | `/creation-tools/v1/works/<id>` · `/creation-tools/v1/pc/home/recommend-work` · `/pc/discover/newest-work` · `/web/works/discovery` · `/tiger/work/tree/<id>`；播放器可外链 `player.codemao.cn` |
| 作品评论 | `/web/discussions/...?source=WORK`（结构与论坛回帖类似） |
| 工作室 | `/web/shops/<id>` · `/web/shops/<id>/users` · `/web/works/subjects/<id>/works` · `/web/work-shops/search` · `/web/work_shops/*` 🔒 |
| 小说 | `/api/fanfic/list/recommend` · `/web/fanfic/*` |
| 首页 | ✅ `GET /web/banners/all` |

## 5. 架构建议

```
浏览器 ──> YesMiao 前端（SSR 页面） ──> YesMiao 代理 /api/* ──> api.codemao.cn
                         │                    └─ 读自家 httpOnly cookie 里的 token，补上 authorization 请求头
                         └─ 公开数据可在服务端直接拉取并渲染（利于 SEO 和首屏速度）
```

- 代理只做透传加白名单：仅放行上面列出的路径前缀，避免变成一个开放代理
- 公开读接口在代理层加短时缓存（例如 30–60 秒），减少所有流量都从同一出口 IP 打到官方带来的限流风险
- 帖子 HTML 在服务端用 sanitize 白名单过滤后再渲染
- 发帖编辑器输出 HTML，保持与官方格式兼容，以便官方 App 等其它客户端也能正常显示

## 6. 托管平台对比（2026-10-24 查阅官方文档）

| | Cloudflare Workers 免费版 | Cloudflare Workers 付费版 | EdgeOne Makers 免费版（原 EdgeOne Pages） |
| --- | --- | --- | --- |
| 函数请求数 | 10 万/天，超出返回 1027 错误 | 1000 万/月 + $0.30/百万 | Edge Functions 300 万/月；Cloud Functions 100 万/月 |
| CPU | 10 ms/次 | 3000 万 ms/月 | 单次 200 ms；Edge Functions 合计 300 万 ms/月 |
| 超限处理 | 直接报错 | 按量计费 | 商业化前"超限也优先保障业务稳定"，可提工单提额 |
| 静态资源 | 免费不限量 | 免费不限量 | 不计入函数次数 |
| 国内访问 | `workers.dev` 基本不可用；自定义域名走海外节点 | 同左 | 备案域名可用国内节点；不备案只能选"全球（不含大陆）"区域 |
| 默认域名在国内 | — | — | 只能用 3 小时有效的预览链接，过期返回 401，不能给公众使用 |
| 到 api.codemao.cn | 海外 → 国内，延迟高 | 同左 | 国内节点直连 |

**实测延迟**（2026-10-24 周六晚高峰，沈阳联通，每项 5 次取平均）：

| 目标 | ping | TCP 建连 | 首字节 |
| --- | --- | --- | --- |
| EdgeOne 大陆节点（`edgeone.run` 演示站） | — | 8 ms | 62 ms |
| EdgeOne 国际·不含大陆（`pages.edgeone.ai`，43.168.19.103） | 55 ms，抖动 0.5 ms | 71 ms | 199 ms |
| Cloudflare（调度到大阪 KIX） | 278 ms，抖动 33 ms | 122 ms（最大 583） | 847 ms |
| api.codemao.cn 直连 | — | 40 ms | 303 ms |

结论：EdgeOne 国际版不用备案，在国内的延迟大约是 CF 的 1/4，而且很稳定。只测了一条联通线路，电信和移动用户的情况需要另测。

来源：[CF limits](https://developers.cloudflare.com/workers/platform/limits/) · [CF pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [EdgeOne 限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas) · [EdgeOne Edge Functions](https://pages.edgeone.ai/zh/document/edge-functions) · [EdgeOne 域名管理](https://pages.edgeone.ai/zh/document/domain-overview)

## 7. 待验证 / 风险

1. 真实账号密码登录是否要求验证码（需要用测试账号试一次）
2. token 有效期与 `tokens/refresh` 的用法
3. 所有请求经由同一服务器 IP 转发，官方 WAF（`acw_tc`/阿里云）可能会限流或拦截
4. 官方随时可能下线 API，是否需要做数据快照/备份
