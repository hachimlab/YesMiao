// 字段名保持与编程猫 API 原样一致，方便对照 docs/research.md

export interface Paged<T> {
  items: T[];
  offset: number;
  limit: number;
  total: number;
  counted?: boolean;
}

/* ---------- 论坛 ---------- */

export interface ForumUser {
  id: string;
  nickname: string;
  avatar_url?: string;
  subject_id?: number;
  work_shop_name?: string;
  work_shop_level?: number;
}

export interface Board {
  id: string;
  name: string;
  icon_url: string;
  description?: string;
  is_hot: boolean;
  n_posts?: number;
  n_discussions?: number;
}

export interface Post {
  id: string;
  user: ForumUser;
  title: string;
  content: string;
  board_id?: string;
  board_name?: string;
  n_views?: number;
  n_replies: number;
  n_comments: number;
  is_authorized: boolean;
  is_featured: boolean;
  is_hotted: boolean;
  is_pinned: boolean;
  tutorial_flag: number;
  ask_help_flag: number;
  created_at: number;
  updated_at?: number;
  replied_at?: number;
  reply_user?: ForumUser;
}

export interface ForumComment {
  id: string;
  user: ForumUser;
  content: string;
  n_likes: number;
  is_liked: boolean;
  reply_user?: { id: string; nickname: string };
  created_at: number;
}

export interface Reply {
  id: string;
  user: ForumUser;
  content: string;
  n_likes: number;
  is_liked: boolean;
  is_top: boolean;
  n_comments: number;
  created_at: number;
  earliest_comments: ForumComment[];
}

export interface Notice {
  id: string;
  post_id: string;
  post_title: string;
  ordinal: number;
}

/* ---------- 作品 ---------- */

export interface WorkCardData {
  id: number | string;
  name: string;
  preview: string;
  view_times: number;
  praise_times: number;
  user: { id: number | string; nickname: string; avatar_url?: string };
}

export interface WorkDetail {
  id: number;
  work_name: string;
  type: string;
  ide_type: string;
  operation: string;
  description: string;
  parent_id: number;
  orientation: number;
  player_url: string;
  preview: string;
  view_times: number;
  praise_times: number;
  collect_times: number;
  share_times: number;
  comment_times: number;
  publish_time: number;
  n_tree_nodes: number;
  fork_enable: boolean;
  bcm_version?: string;
  user_info: { id: number; nickname: string; avatar: string; description: string };
  abilities: { is_collected: boolean; is_praised: boolean; is_owned: boolean };
}

export interface WorkLabel {
  type: string;
  id: number;
  name: string;
}

export interface WorkCommentUser {
  id: number;
  nickname: string;
  avatar_url: string;
}

export interface WorkCommentReply {
  id: number;
  reply_user: WorkCommentUser;
  parent_user?: WorkCommentUser;
  content: string;
  created_at: number;
}

export interface WorkComment {
  id: number;
  user: WorkCommentUser;
  is_top: boolean;
  n_likes: number;
  is_liked: boolean;
  content: string;
  created_at: number;
  /** 没有回复时接口不返回这个字段 */
  replies?: Paged<WorkCommentReply>;
}

/* ---------- 用户 ---------- */

export interface UserHonor {
  user_id: number;
  nickname: string;
  avatar_url: string;
  user_description: string;
  doing: string;
  attention_status: boolean;
  attention_total: number;
  fans_total: number;
  liked_total: number;
  view_times: number;
  collected_total: number;
  re_created_total: number;
  author_level: number;
  is_official_certification: number;
  subject_id: number;
  work_shop_name: string;
  work_shop_level: number;
}

export interface UserWork {
  id: number;
  work_name: string;
  preview: string;
  view_times: number;
  liked_times: number;
  collect_times: number;
  publish_time: number;
}

export interface CollectedWork {
  id: number;
  name: string;
  preview: string;
  user_id: number;
  nickname: string;
  avatar_url: string;
  views_count: number;
  likes_count: number;
}

export interface FollowUser {
  id: number;
  nickname: string;
  avatar_url: string;
  n_works: number;
  total_likes: number;
  description: string;
}

export interface MyDetails {
  id: string;
  nickname: string;
  avatar_url: string;
  username?: string;
  description: string;
  sex: string;
  phone_number?: string;
  voice_forbidden?: boolean;
  author_level?: number;
}

export interface Message {
  id: string;
  type: string;
  content: string;
  sender_id: string;
  read_status: 'READ' | 'UNREAD';
  created_at: number;
}

/** 本站 KV 里存的 GitHub 绑定，id 是 GitHub 的数字用户 ID（用户名可以改，id 不变） */
export interface GithubBinding {
  id: number;
  login: string;
  show: boolean;
}
