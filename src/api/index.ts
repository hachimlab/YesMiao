import { api } from './client';
import type {
  Board,
  CollectedWork,
  FollowUser,
  ForumComment,
  Message,
  MyDetails,
  Notice,
  Paged,
  Post,
  Reply,
  UserHonor,
  UserWork,
  WorkCardData,
  WorkComment,
  WorkCommentReply,
  WorkDetail,
  WorkLabel,
} from './types';

export * from './types';
export { ApiError } from './client';
export { userdb, USERDB_HOME, type UserDBUser } from './userdb';

/** 编程猫的列表接口大多要求 limit 在 5–30 之间 */
export const PAGE_SIZE = 20;

/* ---------- 论坛 ---------- */

/** 置顶回帖总是排在最前；created_at 为时间正序 */
export type ReplySort = 'created_at' | '-created_at' | '-n_likes';

export const forum = {
  boards: () => api<{ items: Board[] }>('/web/forums/boards/simples/all').then((d) => d.items),
  board: (id: string) => api<Board>(`/web/forums/boards/${id}`),
  boardPosts: (id: string, page: number) =>
    api<Paged<Post>>(`/web/forums/boards/${id}/posts`, { query: { page, limit: PAGE_SIZE } }),
  selections: (page: number, boardId?: string) =>
    api<Paged<Post>>('/web/forums/posts/selections', {
      query: { board_id: boardId, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
    }),
  hotIds: () => api<{ items: string[] }>('/web/forums/posts/hots/all').then((d) => d.items),
  postsByIds: (ids: string[]) =>
    api<{ items: Post[] }>('/web/forums/posts/all', { query: { ids: ids.join(',') } }).then((d) => d.items),
  /** 热门是一份约 300 个帖子 ID 的列表，按页切片后批量取详情 */
  hot: async (page: number, ids: string[]): Promise<Paged<Post>> => {
    const slice = ids.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const posts = slice.length ? await forum.postsByIds(slice) : [];
    const byId = new Map(posts.map((p) => [String(p.id), p]));
    return {
      items: slice.map((id) => byId.get(id)).filter((p): p is Post => !!p),
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
      total: ids.length,
    };
  },
  askHelp: (page: number) =>
    api<Paged<Post>>('/web/forums/boards/posts/ask-help', { query: { page, limit: PAGE_SIZE } }),
  notices: () => api<{ items: Notice[] }>('/web/forums/notice-boards', { query: { limit: 4 } }).then((d) => d.items),
  search: (title: string, page: number) =>
    api<Paged<Post>>('/web/forums/posts/search', { query: { title, page, limit: PAGE_SIZE } }),
  post: (id: string) => api<Post>(`/web/forums/posts/${id}/details`),
  replies: (id: string, page: number, sort: ReplySort) =>
    api<Paged<Reply>>(`/web/forums/posts/${id}/replies`, { query: { page, limit: PAGE_SIZE, sort } }),
  comments: (replyId: string, page: number) =>
    api<Paged<ForumComment>>(`/web/forums/replies/${replyId}/comments`, { query: { page, limit: 10 } }),
  myPosts: (page: number) =>
    api<Paged<Post>>('/web/forums/posts/mine/created', { query: { page, limit: PAGE_SIZE } }),
  myReplied: (page: number) =>
    api<Paged<Post>>('/web/forums/posts/mine/replied', { query: { page, limit: PAGE_SIZE } }),

  createPost: (boardId: string, title: string, content: string) =>
    api<{ id: string }>(`/web/forums/boards/${boardId}/posts`, { method: 'POST', body: { title, content } }),
  addReply: (postId: string, content: string) =>
    api<{ id: string }>(`/web/forums/posts/${postId}/replies`, { method: 'POST', body: { content } }),
  addComment: (replyId: string, content: string, parentId = 0) =>
    api<{ id: string }>(`/web/forums/replies/${replyId}/comments`, {
      method: 'POST',
      body: { content, parent_id: parentId },
    }),
  /** 回帖和回复的点赞共用一个接口，用 source 区分 */
  like: (id: string, source: 'REPLY' | 'COMMENT', liked: boolean) =>
    api<void>(`/web/forums/comments/${id}/liked`, { method: liked ? 'PUT' : 'DELETE', query: { source }, body: {} }),
  deletePost: (id: string) => api<void>(`/web/forums/posts/${id}`, { method: 'DELETE' }),
  deleteReply: (id: string) => api<void>(`/web/forums/replies/${id}`, { method: 'DELETE' }),
  deleteComment: (id: string) => api<void>(`/web/forums/comments/${id}`, { method: 'DELETE' }),
};

/* ---------- 作品 ---------- */

interface NewestWork {
  work_id: number;
  work_name: string;
  preview_url: string;
  user_id: number;
  avatar_url: string;
  nickname: string;
  views_count: number;
  likes_count: number;
}

export type DiscoverOrder = 'UPDATE_TIME' | 'VIEW_TIMES';

export const works = {
  /** type=1 精选，type=2 热门 */
  recommended: (type: 1 | 2) =>
    api<WorkCardData[]>('/creation-tools/v1/pc/home/recommend-work', { query: { type } }),
  newest: (page: number) =>
    api<Paged<NewestWork>>('/creation-tools/v1/pc/discover/newest-work', {
      query: { offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
    }).then(
      (d): Paged<WorkCardData> => ({
        ...d,
        items: d.items.map((w) => ({
          id: w.work_id,
          name: w.work_name,
          preview: w.preview_url,
          view_times: w.views_count,
          praise_times: w.likes_count,
          user: { id: w.user_id, nickname: w.nickname, avatar_url: w.avatar_url },
        })),
      }),
    ),
  discovery: (order: DiscoverOrder, page: number) =>
    api<Paged<WorkCardData>>('/web/works/discovery', {
      query: { type: 'KITTEN', order, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
    }),
  /** 按作品名搜索，结果按发布时间倒序 */
  search: (key: string, page: number) =>
    api<
      Paged<{ id: number; work_name: string; preview: string; user_id: number; nickname: string; avatar_url: string; view_times: number; praise_times: number }>
    >('/nemo/v2/work/name/search', { query: { key, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE } }).then(
      (d): Paged<WorkCardData> => ({
        ...d,
        items: d.items.map((w) => ({
          id: w.id,
          name: w.work_name,
          preview: w.preview,
          view_times: w.view_times,
          praise_times: w.praise_times,
          user: { id: w.user_id, nickname: w.nickname, avatar_url: w.avatar_url },
        })),
      }),
    ),
  detail: (id: string) => api<WorkDetail>(`/creation-tools/v1/works/${id}`),
  labels: (id: string) => api<WorkLabel[]>('/creation-tools/v1/work-details/work-labels', { query: { work_id: id } }),
  related: (id: string) =>
    api<
      { id: number; work_name: string; preview: string; praise_times: number; view_times: number; user_id: number; nickname: string; avatar: string }[]
    >(`/nemo/v2/works/web/${id}/recommended`).then((list) =>
      list.map(
        (w): WorkCardData => ({
          id: w.id,
          name: w.work_name,
          preview: w.preview,
          view_times: w.view_times,
          praise_times: w.praise_times,
          user: { id: w.user_id, nickname: w.nickname, avatar_url: w.avatar },
        }),
      ),
    ),
  comments: (id: string, page: number) =>
    api<Paged<WorkComment> & { total_reply: number }>(`/creation-tools/v1/works/${id}/comments`, {
      query: { offset: (page - 1) * 10, limit: 10 },
    }),
  commentReplies: (id: string, commentId: number, page: number) =>
    api<Paged<WorkCommentReply>>(`/creation-tools/v1/works/${id}/comments/${commentId}/replies`, {
      query: { offset: (page - 1) * 10, limit: 10 },
    }),

  addComment: (id: string, content: string) =>
    api<void>(`/creation-tools/v1/works/${id}/comment`, { method: 'POST', body: { content, emoji_content: '' } }),
  replyComment: (id: string, commentId: number, content: string, parentId = 0) =>
    api<void>(`/creation-tools/v1/works/${id}/comment/${commentId}/reply`, {
      method: 'POST',
      body: { content, parent_id: parentId },
    }),
  likeComment: (id: string, commentId: number, liked: boolean) =>
    api<void>(`/creation-tools/v1/works/${id}/comment/${commentId}/liked`, { method: liked ? 'POST' : 'DELETE', body: {} }),
  like: (id: string, liked: boolean) =>
    api<void>(`/nemo/v2/works/${id}/like`, { method: liked ? 'POST' : 'DELETE', body: {} }),
  collect: (id: string, collected: boolean) =>
    api<void>(`/nemo/v2/works/${id}/collection`, { method: collected ? 'POST' : 'DELETE', body: {} }),
};

/* ---------- 用户 ---------- */

export const users = {
  honor: (id: string) => api<UserHonor>('/creation-tools/v1/user/center/honor', { query: { user_id: id } }),
  works: (id: string, page: number) =>
    api<Paged<UserWork>>('/creation-tools/v2/user/center/work-list', {
      query: { user_id: id, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
    }),
  collections: (id: string, page: number) =>
    api<Paged<CollectedWork>>('/creation-tools/v1/user/center/collect/list', {
      query: { user_id: id, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
    }),
  fans: (id: string, page: number) =>
    api<Paged<FollowUser>>('/creation-tools/v1/user/fans', {
      query: { user_id: id, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
    }),
  following: (id: string, page: number) =>
    api<Paged<FollowUser>>('/creation-tools/v1/user/followers', {
      query: { user_id: id, offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
    }),
  follow: (id: string, follow: boolean) =>
    api<void>(`/nemo/v2/user/${id}/follow`, { method: follow ? 'POST' : 'DELETE', body: {} }),
};

/* ---------- 登录与个人中心 ---------- */

export type MessageType = 'COMMENT_REPLY' | 'LIKE_FORK' | 'SYSTEM';

export const me = {
  details: () => api<MyDetails>('/web/users/details'),
  login: (identity: string, password: string) =>
    api<{ user_info: { id: number; nickname: string } }>('/_auth/login', { method: 'POST', body: { identity, password } }),
  logout: () => api<void>('/_auth/logout', { method: 'POST', body: {} }),
  updateInfo: (info: { nickname?: string; description?: string }) =>
    api<void>('/tiger/v3/web/accounts/info', { method: 'PATCH', body: info }),
  messageCount: () => api<{ query_type: MessageType; count: number }[]>('/web/message-record/count'),
  messages: (type: MessageType, page: number) =>
    api<Paged<Message>>('/web/message-record', { query: { query_type: type, offset: (page - 1) * 10, limit: 10 } }),
};
