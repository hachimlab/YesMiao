import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { textToHtml } from '../components/ui';

/*
 * 发帖/评论限制，照搬官方前端（shequ.codemao.cn 的 forum_sender、comment_reply 等组件）发布前的校验，
 * 提示文案也用官方原文。字数按 JS 字符串长度算，和官方一致。
 */

/** 官方 /web/config/opr/limit/toast/text 里的键，值是“每日可发布 5 次”这样的提示 */
export type QuotaKey = 'forum_post' | 'forum_reply_post' | 'forum_comment' | 'work_comment';

export interface PublishRule {
  quota: QuotaKey;
  /** 正文字数上限：输入框直接截断并显示计数 */
  maxLength?: number;
  /** 返回错误提示；通过时返回 undefined */
  check: (text: string, title: string) => string | undefined;
}

const hasText = (text: string, min: number) => text.length >= min;

export const RULES = {
  /** 发起讨论：标题 5–50 字，正文至少 10 字，生成的 HTML 不超过 5 万字符 */
  post: {
    quota: 'forum_post',
    check: (text, title) => {
      if (title.length < 5 || title.length > 50) return '请填写5-50字的标题';
      if (!hasText(text, 10)) return '帖子内容至少10个字';
      if (textToHtml(text).length > 50000) return '内容过长!';
    },
  },
  /** 回帖：至少 2 字，HTML 不超过 9000 字符 */
  reply: {
    quota: 'forum_reply_post',
    check: (text) => {
      if (!hasText(text, 2)) return '回帖内容至少2个字';
      if (textToHtml(text).length > 9000) return '内容过长!';
    },
  },
  /** 论坛回帖下的回复（楼中楼）：2–200 字 */
  forumComment: {
    quota: 'forum_comment',
    maxLength: 200,
    check: (text) => (hasText(text, 2) ? undefined : '请输入2-200字的评论内容'),
  },
  /** 作品评论下的回复：2–200 字，次数和作品评论共用 */
  workReply: {
    quota: 'work_comment',
    maxLength: 200,
    check: (text) => (hasText(text, 2) ? undefined : '请输入2-200字的评论内容'),
  },
  /** 作品评论：不能为空，最多 200 字 */
  workComment: {
    quota: 'work_comment',
    maxLength: 200,
    check: (text) => (text ? undefined : '请填写评论内容'),
  },
} satisfies Record<string, PublishRule>;

/** 每日次数提示。只是文案，真正的计数在编程猫服务端，超出后接口会返回错误 */
export function useQuotaTip(key: QuotaKey | undefined) {
  const q = useQuery({
    queryKey: ['opr-limit'],
    queryFn: () => api<Partial<Record<QuotaKey, string>>>('/web/config/opr/limit/toast/text'),
    staleTime: 24 * 3600_000,
    enabled: !!key,
  });
  return key ? (q.data?.[key] ?? '') : '';
}
