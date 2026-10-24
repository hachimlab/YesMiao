import { useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ApiError, works, type WorkComment, type WorkCommentReply, type WorkDetail } from '../../api';
import { Icon, type IconName } from '../../components/icons';
import { useOverlays } from '../../components/overlays';
import { Avatar, ErrorBox, HiddenItem, ListState, Loading, PostAction, Username, useLoadMore } from '../../components/ui';
import { useBlocklist } from '../../lib/appearance';
import { useMe } from '../../lib/auth';
import { RULES, useQuotaTip } from '../../lib/limits';
import { compactNumber, formatDate, timeAgo } from '../../lib/format';
import { CopyLinkAction, ToggleAction, useToggle } from '../forum/DiscussionPage';

/** 作品类型 → 编辑器名称，没收录的直接显示原值 */
const EDITORS: Record<string, string> = {
  KITTEN4: 'Kitten 4',
  KITTEN3: 'Kitten 3',
  KITTEN2: 'Kitten 2',
  NEKO: 'Kitten N',
  NEMO: 'Nemo',
  COCO: 'CoCo',
};

/**
 * 作品详情里 orientation 对应的舞台宽高比（按 screenshot_cover_url 的截图尺寸核对过）：
 * 1 竖屏 310×450，2 横屏 4:3，3 横屏 16:9；官方社区前端本身不读这个字段
 */
const STAGE_RATIOS: Record<number, number> = { 1: 310 / 450, 2: 4 / 3, 3: 16 / 9 };

/** 官方 player 页面允许被 iframe 嵌入，点击后再加载，避免进页面就跑作品；两侧空白用封面的模糊图填充 */
function Player({ work }: { work: WorkDetail }) {
  const [playing, setPlaying] = useState(false);
  const ratio = STAGE_RATIOS[work.orientation] ?? 16 / 9;
  return (
    <div className="Player" style={{ '--stage-ratio': ratio } as CSSProperties}>
      <img className="Player-backdrop" src={work.preview} alt="" referrerPolicy="no-referrer" aria-hidden />
      {playing ? (
        <iframe src={work.player_url} title={work.work_name} allow="autoplay; fullscreen; gamepad; microphone; camera" allowFullScreen />
      ) : (
        <button className="Player-cover" onClick={() => setPlaying(true)} aria-label="运行作品">
          <img src={work.preview} alt="" referrerPolicy="no-referrer" />
          <span className="Player-play">
            <Icon name="play" />
          </span>
        </button>
      )}
    </div>
  );
}

/** 播放器下方的“点赞 10”这类按钮：图标 + 文字 + 数字 */
function StatToggle({ icon, label, active, count, send }: { icon: IconName; label: string; active: boolean; count: number; send: (v: boolean) => Promise<void> }) {
  const [state, toggle] = useToggle({ active, count }, send);
  return (
    <button className={`WorkStat${state.active ? ' active' : ''}`} onClick={toggle} aria-pressed={state.active}>
      <Icon name={icon} size={16} />
      {label} <span className="WorkStat-count">{compactNumber(state.count)}</span>
    </button>
  );
}

function CommentReplies({ workId, comment }: { workId: string; comment: WorkComment }) {
  const qc = useQueryClient();
  const { openComposer } = useOverlays();
  const blocked = useBlocklist();
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['work-replies', workId, comment.id, page],
    queryFn: () => works.commentReplies(workId, comment.id, page),
    enabled: expanded,
  });
  const list = expanded ? q.data?.items : comment.replies?.items.slice(0, 3);
  const total = q.data?.total ?? comment.replies?.total ?? 0;
  const pages = Math.ceil(total / 10);

  function compose(to: WorkCommentReply | null) {
    openComposer({
      heading: (
        <>
          回复 <strong>{to ? to.reply_user.nickname : comment.user.nickname}</strong>
        </>
      ),
      placeholder: '写下你的回复',
      submitLabel: '发布回复',
      rule: RULES.workReply,
      onSubmit: async ({ text }) => {
        await works.replyComment(workId, comment.id, text, to ? to.id : 0);
        setExpanded(true);
        await qc.invalidateQueries({ queryKey: ['work-replies', workId, comment.id] });
      },
    });
  }

  if (!list?.length && !expanded) return null;
  return (
    <div className="CommentList">
      <ul>
        {list?.filter((r) => !blocked.user(r.reply_user.id) && !blocked.text(r.content)).map((r) => (
          <li className="CommentList-item" key={r.id}>
            <Avatar src={r.reply_user.avatar_url} name={r.reply_user.nickname} size={24} />
            <Username id={r.reply_user.id} name={r.reply_user.nickname} />
            {r.parent_user && (
              <span className="CommentList-replyTo">
                回复 <Link to={`/u/${r.parent_user.id}`}>{r.parent_user.nickname}</Link>
              </span>
            )}
            <span>{r.content}</span>
            <span className="CommentList-meta">
              <time>{timeAgo(r.created_at)}</time>
              <button onClick={() => compose(r)}>回复</button>
            </span>
          </li>
        ))}
      </ul>
      {expanded && q.isLoading && <Loading />}
      <div className="CommentList-more">
        {!expanded && total > 3 && <button onClick={() => setExpanded(true)}>查看全部 {total} 条回复</button>}
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

/** 评论区顶部的输入框：直接在页面里写，不弹编辑器 */
function CommentInput({ onSubmit }: { onSubmit: (text: string) => Promise<void> }) {
  const { user } = useMe();
  const { openLogin } = useOverlays();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const quota = useQuotaTip(user ? RULES.workComment.quota : undefined);

  async function send() {
    if (!user) return openLogin();
    if (!text.trim() || sending) return;
    const invalid = RULES.workComment.check(text.trim());
    if (invalid) return setError(invalid);
    setSending(true);
    setError('');
    try {
      await onSubmit(text.trim());
      setText('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '发送失败，请稍后再试');
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="CommentInput"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {user && <Avatar src={user.avatar_url} name={user.nickname} size={36} />}
      <div className="CommentInput-box">
        <textarea
          rows={1}
          value={text}
          maxLength={RULES.workComment.maxLength}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => !user && openLogin()}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send()}
          placeholder={user ? '分享你的想法喵 :3' : '登录后发表评论'}
          aria-label="写评论"
        />
        <button type="submit" className="CommentInput-send" disabled={sending || !text.trim()} aria-label="发送" title="发送（Ctrl/⌘ + Enter）">
          <Icon name="send" size={16} />
        </button>
      </div>
      {user && (
        <p className="CommentInput-meta">
          {error && <span className="CommentInput-error">{error}</span>}
          <span className="CommentInput-limit">
            {quota}
            <span className={text.length >= RULES.workComment.maxLength ? 'full' : ''}>
              {text.length}/{RULES.workComment.maxLength}
            </span>
          </span>
        </p>
      )}
    </form>
  );
}

function CommentItem({ workId, comment: c, floor, isAuthor }: { workId: string; comment: WorkComment; floor: number; isAuthor: boolean }) {
  const qc = useQueryClient();
  const { user } = useMe();
  const { openComposer, openLogin } = useOverlays();
  const blocked = useBlocklist();
  const [shown, setShown] = useState(false);

  function reply() {
    if (!user) return openLogin();
    openComposer({
      heading: (
        <>
          回复 <strong>{c.user.nickname}</strong>
        </>
      ),
      placeholder: '写下你的回复',
      submitLabel: '发布回复',
      rule: RULES.workReply,
      onSubmit: async ({ text }) => {
        await works.replyComment(workId, c.id, text);
        await qc.invalidateQueries({ queryKey: ['work-replies', workId, c.id] });
        await qc.invalidateQueries({ queryKey: ['work-comments', workId] });
      },
    });
  }

  if (!shown && (blocked.user(c.user.id) || blocked.text(c.content))) {
    return (
      <li>
        <HiddenItem onShow={() => setShown(true)} />
      </li>
    );
  }
  return (
    <li className="Comment">
      <Link to={`/u/${c.user.id}`} className="Comment-avatar">
        <Avatar src={c.user.avatar_url} name={c.user.nickname} size={36} />
      </Link>
      <div className="Comment-main">
        <header className="Comment-header">
          <Link to={`/u/${c.user.id}`} className="Comment-name">
            {c.user.nickname}
          </Link>
          {isAuthor && <span className="Badge Badge--author">作者</span>}
          {c.is_top && <span className="Badge Badge--author">置顶</span>}
          <span className="Comment-meta">
            #{floor} <time title={formatDate(c.created_at)}>{timeAgo(c.created_at)}</time>
          </span>
        </header>
        <div className="Comment-body">{c.content}</div>
        <div className="Comment-actions">
          <ToggleAction icon="heart" label="赞" active={c.is_liked} count={c.n_likes} send={(v) => works.likeComment(workId, c.id, v)} />
          <PostAction icon="reply" label="回复" onClick={reply} />
        </div>
        <CommentReplies workId={workId} comment={c} />
      </div>
    </li>
  );
}

export default function WorkPage() {
  const { workId = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['work', workId], queryFn: () => works.detail(workId) });
  const labels = useQuery({ queryKey: ['work-labels', workId], queryFn: () => works.labels(workId) });
  const related = useQuery({ queryKey: ['work-related', workId], queryFn: () => works.related(workId) });
  const comments = useLoadMore<WorkComment>(['work-comments', workId], (page) => works.comments(workId, page));

  if (q.error) return <div className="container"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div>;
  if (!q.data) return <Loading />;
  const w = q.data;

  return (
    <div className="WorkPage">
      <img className="WorkPage-backdrop" src={w.preview} alt="" referrerPolicy="no-referrer" aria-hidden />
      <div className="container WorkLayout">
        <div className="WorkStage">
          <Player work={w} />
          <div className="WorkStats">
            <span className="WorkStat">
              <Icon name="eye" size={16} />
              浏览 {compactNumber(w.view_times)}
            </span>
            <StatToggle icon="heart" label="点赞" active={w.abilities.is_praised} count={w.praise_times} send={(v) => works.like(workId, v)} />
            <StatToggle icon="star" label="收藏" active={w.abilities.is_collected} count={w.collect_times} send={(v) => works.collect(workId, v)} />
            <a className="WorkStat" href="#comments">
              <Icon name="comment" size={16} />
              评论 {compactNumber(w.comment_times)}
            </a>
            <span className="WorkStats-end">
              <a className="PostAction" href={w.player_url} target="_blank" rel="noopener noreferrer" title="全屏运行" aria-label="全屏运行">
                <Icon name="expand" size={16} />
              </a>
              <CopyLinkAction />
            </span>
          </div>
        </div>

        <aside className="WorkSide">
          <section className="WorkPanel WorkInfo">
            <h1>{w.work_name}</h1>
            <Link to={`/u/${w.user_info.id}`} className="WorkInfo-author">
              <Avatar src={w.user_info.avatar} name={w.user_info.nickname} size={36} />
              <strong>{w.user_info.nickname}</strong>
            </Link>
            <p className="WorkInfo-meta">
              使用 {EDITORS[w.type] ?? w.type} 编辑器创作 · {formatDate(w.publish_time)} 发布
            </p>
            {!!labels.data?.length && (
              <div className="WorkInfo-tags">
                {labels.data.map((l) => (
                  <span key={l.id} className="TopicTag">
                    {l.name}
                  </span>
                ))}
              </div>
            )}
          </section>
          {w.operation && (
            <section className="WorkPanel">
              <h3>操作说明</h3>
              <p className="WorkPanel-text">{w.operation}</p>
            </section>
          )}
          {w.description && (
            <section className="WorkPanel">
              <h3>作品介绍</h3>
              <p className="WorkPanel-text">{w.description}</p>
            </section>
          )}
          {!!related.data?.length && (
            <section className="WorkPanel">
              <h3>相关作品</h3>
              {related.data.slice(0, 6).map((r) => (
                <Link key={r.id} to={`/work/${r.id}`} className="MiniWork">
                  <img src={r.preview} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <div>
                    <strong>{r.name}</strong>
                    <span>
                      {r.user.nickname} · {compactNumber(r.view_times)} 浏览
                    </span>
                  </div>
                </Link>
              ))}
            </section>
          )}
        </aside>

        <section className="WorkComments" id="comments">
          <h2 className="WorkComments-title">
            全部评论 <span>({compactNumber(comments.data ? comments.total : w.comment_times)})</span>
          </h2>
          <CommentInput
            onSubmit={async (text) => {
              await works.addComment(workId, text);
              await qc.invalidateQueries({ queryKey: ['work-comments', workId] });
            }}
          />
          <ListState list={comments} empty="还没有评论，来抢沙发吧">
            {(items) => (
              <ul className="CommentStream">
                {items.map((c, i) => (
                  <CommentItem key={c.id} workId={workId} comment={c} floor={i + 1} isAuthor={String(c.user.id) === String(w.user_info.id)} />
                ))}
              </ul>
            )}
          </ListState>
        </section>
      </div>
    </div>
  );
}
