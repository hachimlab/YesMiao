import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { forum, type ForumComment, type ForumUser, type Post, type Reply, type ReplySort } from '../../api';
import { useOverlays } from '../../components/overlays';
import RichContent from '../../components/RichContent';
import { Avatar, Button, CategoryBadge, ErrorBox, HiddenItem, ListState, Loading, PostAction, TopicTitle, Username, textToHtml, useLoadMore } from '../../components/ui';
import type { IconName } from '../../components/icons';
import { useBlocklist } from '../../lib/appearance';
import { useMe } from '../../lib/auth';
import { RULES } from '../../lib/limits';
import { compactNumber, formatDate, timeAgo } from '../../lib/format';

/** 点赞/收藏这类开关：乐观更新，失败回滚 */
export function useToggle(initial: { active: boolean; count: number }, send: (active: boolean) => Promise<void>) {
  const { user } = useMe();
  const { openLogin } = useOverlays();
  const [state, setState] = useState(initial);
  async function toggle() {
    if (!user) return openLogin();
    const prev = state;
    const active = !state.active;
    setState({ active, count: state.count + (active ? 1 : -1) });
    try {
      await send(active);
    } catch {
      setState(prev);
    }
  }
  return [state, toggle] as const;
}

export function ToggleAction({ icon, label, active, count, send }: { icon: IconName; label: string; active: boolean; count: number; send: (v: boolean) => Promise<void> }) {
  const [state, toggle] = useToggle({ active, count }, send);
  return <PostAction icon={icon} label={label} count={state.count} active={state.active} className={`PostAction--${icon}`} onClick={toggle} />;
}

export function CopyLinkAction() {
  const [copied, setCopied] = useState(false);
  return (
    <PostAction
      icon={copied ? 'check' : 'link'}
      label="复制链接"
      onClick={async () => {
        await navigator.clipboard?.writeText(location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    />
  );
}

/** 一层楼（主楼或回帖），布局对应 Discourse 的 topic-post：左侧头像，右侧正文，操作在右下角 */
export function PostView({
  user,
  createdAt,
  html,
  plain,
  content,
  badges,
  actions,
  children,
}: {
  user: { id: string | number; nickname: string; avatar_url?: string };
  createdAt: number;
  html?: string;
  plain?: boolean;
  /** 不是一段 HTML 的正文（比如作品页的播放器） */
  content?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className="Post">
      <Link to={`/u/${user.id}`} className="Post-avatar">
        <Avatar src={user.avatar_url} name={user.nickname} size={48} />
      </Link>
      <div className="Post-main">
        <header className="Post-header">
          <Link to={`/u/${user.id}`} className="Post-headerAvatar">
            <Avatar src={user.avatar_url} name={user.nickname} size={24} />
          </Link>
          <Link to={`/u/${user.id}`} className="PostUser-name">
            {user.nickname}
          </Link>
          {badges}
          <time className="Post-time" title={formatDate(createdAt)}>
            {timeAgo(createdAt)}
          </time>
        </header>
        {content ?? (plain ? <div className="Post-body plain">{html}</div> : <RichContent html={html ?? ''} className="Post-body" />)}
        {actions && <div className="Post-actions">{actions}</div>}
        {children}
      </div>
    </article>
  );
}

/** 帖子统计（Discourse 的 topic-map）：数字 + 参与者头像 */
export function TopicMap({ stats, users, className = '' }: { stats: { label: string; value: ReactNode }[]; users?: ForumUser[]; className?: string }) {
  return (
    <div className={`TopicMap ${className}`}>
      {stats.map((s) => (
        <div className="TopicMap-stat" key={s.label}>
          <strong>{s.value}</strong>
          <span>{s.label}</span>
        </div>
      ))}
      {!!users?.length && (
        <div className="TopicMap-users">
          <h4>参与者</h4>
          {users.map((u) => (
            <Link key={u.id} to={`/u/${u.id}`} title={u.nickname}>
              <Avatar src={u.avatar_url} name={u.nickname} size={32} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentLine({ c, onReply }: { c: ForumComment; onReply: (c: ForumComment) => void }) {
  const [like, toggle] = useToggle({ active: c.is_liked, count: c.n_likes }, (v) => forum.like(c.id, 'COMMENT', v));
  const blocked = useBlocklist();
  if (blocked.user(c.user.id) || blocked.text(c.content)) return null;
  return (
    <li className="CommentList-item">
      <Avatar src={c.user.avatar_url} name={c.user.nickname} size={24} />
      <Username id={c.user.id} name={c.user.nickname} />
      {c.reply_user && (
        <span className="CommentList-replyTo">
          回复 <Link to={`/u/${c.reply_user.id}`}>{c.reply_user.nickname}</Link>
        </span>
      )}
      <span>{c.content}</span>
      <span className="CommentList-meta">
        <time>{timeAgo(c.created_at)}</time>
        <button className={like.active ? 'liked' : ''} onClick={toggle}>
          赞{like.count ? <span className="count"> {like.count}</span> : ''}
        </button>
        <button onClick={() => onReply(c)}>回复</button>
      </span>
    </li>
  );
}

/** 编程猫的回帖下还有“回复”（楼中楼），Flarum 没有这一层，这里做成回帖下方的浅色列表 */
function ReplyComments({ reply, postTitle }: { reply: Reply; postTitle: string }) {
  const qc = useQueryClient();
  const { openComposer } = useOverlays();
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['comments', reply.id, page],
    queryFn: () => forum.comments(reply.id, page),
    enabled: expanded,
  });
  const list = expanded ? q.data?.items : reply.earliest_comments.slice(0, 3);
  const total = q.data?.total ?? reply.n_comments;
  const pages = Math.ceil(total / 10);

  function compose(to: ForumComment | null) {
    openComposer({
      heading: (
        <>
          回复 <strong>{to ? to.user.nickname : reply.user.nickname}</strong> · {postTitle}
        </>
      ),
      placeholder: '写下你的回复',
      submitLabel: '发布回复',
      rule: RULES.forumComment,
      onSubmit: async ({ text }) => {
        await forum.addComment(reply.id, text, to ? Number(to.id) : 0);
        setExpanded(true);
        await qc.invalidateQueries({ queryKey: ['comments', reply.id] });
      },
    });
  }

  if (!list?.length && !expanded) return null;
  return (
    <div className="CommentList">
      <ul>
        {list?.map((c) => (
          <CommentLine key={c.id} c={c} onReply={compose} />
        ))}
      </ul>
      {expanded && q.isLoading && <Loading />}
      <div className="CommentList-more">
        {!expanded && reply.n_comments > 3 && <button onClick={() => setExpanded(true)}>查看全部 {reply.n_comments} 条回复</button>}
        <button onClick={() => compose(null)}>回复</button>
        {expanded && pages > 1 && (
          <span className="CommentList-pager">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
            {page} / {pages}
            <button disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</button>
          </span>
        )}
      </div>
    </div>
  );
}

function ReplyPost({ reply, isAuthor, postTitle, onComment }: { reply: Reply; isAuthor: boolean; postTitle: string; onComment: () => void }) {
  const blocked = useBlocklist();
  const [shown, setShown] = useState(false);
  if (!shown && (blocked.user(reply.user.id) || blocked.html(reply.content))) return <HiddenItem onShow={() => setShown(true)} />;
  return (
    <PostView
      user={reply.user}
      createdAt={reply.created_at}
      html={reply.content}
      badges={
        <>
          {isAuthor && <span className="Badge Badge--author">楼主</span>}
          {reply.is_top && <span className="Badge Badge--author">置顶</span>}
        </>
      }
      actions={
        <>
          <ToggleAction icon="heart" label="赞" active={reply.is_liked} count={reply.n_likes} send={(v) => forum.like(reply.id, 'REPLY', v)} />
          <PostAction icon="reply" label="回复" onClick={onComment} />
        </>
      }
    >
      <ReplyComments reply={reply} postTitle={postTitle} />
    </PostView>
  );
}

const SORTS: { value: ReplySort; label: string }[] = [
  { value: 'created_at', label: '最早' },
  { value: '-created_at', label: '最新' },
  { value: '-n_likes', label: '最热' },
];

/** 主楼统计条里的参与者：楼主在前，其余按已加载回帖的出场顺序 */
function participants(p: Post, replies: Reply[]) {
  const seen = new Map<string, ForumUser>([[String(p.user.id), p.user]]);
  for (const r of replies) if (!seen.has(String(r.user.id))) seen.set(String(r.user.id), r.user);
  return [...seen.values()].slice(0, 8);
}

export default function DiscussionPage() {
  const { postId = '' } = useParams();
  const { user } = useMe();
  const { openComposer, openLogin } = useOverlays();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [sort, setSort] = useState<ReplySort>('created_at');

  const post = useQuery({ queryKey: ['post', postId], queryFn: () => forum.post(postId) });
  const replies = useLoadMore<Reply>(['replies', postId, sort], (page) => forum.replies(postId, page, sort));

  if (post.error) return <div className="container"><ErrorBox error={post.error} onRetry={() => post.refetch()} /></div>;
  if (!post.data) return <Loading />;
  const p = post.data;
  const isMine = !!user && String(user.id) === String(p.user.id);
  // 宽屏放在右侧栏，窄屏放在主楼末尾，两处共用
  const stats = [
    { label: '浏览量', value: compactNumber(p.n_views) },
    { label: '回帖', value: compactNumber(p.n_replies) },
    { label: '楼中楼', value: compactNumber(p.n_comments) },
    ...(p.replied_at ? [{ label: '最后回复', value: timeAgo(p.replied_at) }] : []),
  ];
  const people = participants(p, replies.items);

  function replyToPost() {
    if (!user) return openLogin();
    openComposer({
      heading: (
        <>
          回复 <strong>{p.title}</strong>
        </>
      ),
      placeholder: '写下你的回帖，空一行分段',
      submitLabel: '发布回帖',
      rule: RULES.reply,
      onSubmit: async ({ text }) => {
        await forum.addReply(p.id, textToHtml(text));
        setSort('-created_at');
        await qc.invalidateQueries({ queryKey: ['replies', postId] });
      },
    });
  }

  function commentOn(reply: Reply) {
    openComposer({
      heading: (
        <>
          回复 <strong>{reply.user.nickname}</strong> · {p.title}
        </>
      ),
      placeholder: '写下你的回复',
      submitLabel: '发布回复',
      rule: RULES.forumComment,
      onSubmit: async ({ text }) => {
        await forum.addComment(reply.id, text);
        await qc.invalidateQueries({ queryKey: ['comments', reply.id] });
        await qc.invalidateQueries({ queryKey: ['replies', postId] });
      },
    });
  }

  async function remove() {
    if (!confirm('确定删除这个讨论吗？')) return;
    await forum.deletePost(p.id);
    navigate(p.board_id ? `/t/${p.board_id}` : '/');
  }

  return (
    <div className="Topic DiscussionPage container">
      <TopicTitle title={p.title}>
        {p.board_id && <CategoryBadge id={p.board_id} name={p.board_name ?? ''} />}
        {p.is_pinned && <span className="Badge Badge--author">置顶</span>}
        {p.is_featured && <span className="Badge Badge--author">精华</span>}
        {p.is_authorized && <span className="Badge Badge--author">官方</span>}
      </TopicTitle>
      <div className="TopicBody">
        <div className="TopicBody-main">
          <ul className="PostStream">
            <li className="PostStream-item">
              <PostView
                user={p.user}
                createdAt={p.created_at}
                html={p.content}
                badges={p.user.work_shop_name && <span className="Post-flair">{p.user.work_shop_name}</span>}
                actions={
                  <>
                    <CopyLinkAction />
                    {isMine && <PostAction icon="trash" label="删除" onClick={remove} />}
                    <PostAction icon="reply" label="回复" onClick={replyToPost} />
                  </>
                }
              >
                <TopicMap className="TopicMap--inline" stats={stats} users={people} />
              </PostView>
            </li>
            <ListState list={replies} empty="还没有人回帖">
              {(items) =>
                items.map((r) => (
                  <li className="PostStream-item" key={r.id}>
                    <ReplyPost
                      reply={r}
                      postTitle={p.title}
                      isAuthor={String(r.user.id) === String(p.user.id)}
                      onComment={() => (user ? commentOn(r) : openLogin())}
                    />
                  </li>
                ))
              }
            </ListState>
          </ul>
          <div className="TopicFooter">
            <Button variant="primary" icon="reply" onClick={replyToPost}>
              {user ? '回复' : '登录后回复'}
            </Button>
          </div>
        </div>
        <aside className="TopicAside TopicAside--top">
          <div className="TopicControls">
            <Button variant="primary" icon="reply" onClick={replyToPost}>
              {user ? '回复' : '登录后回复'}
            </Button>
            <div className="ButtonGroup">
              {SORTS.map((s) => (
                <Button key={s.value} className={sort === s.value ? 'active' : ''} onClick={() => setSort(s.value)}>
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
          <TopicMap className="TopicMap--aside" stats={stats} users={people} />
        </aside>
      </div>
    </div>
  );
}
