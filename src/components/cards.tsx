import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Post, WorkCardData } from '../api';
import { useBlocklist } from '../lib/appearance';
import { compactNumber, htmlToText, timeAgo } from '../lib/format';
import { Icon } from './icons';
import { Avatar, TagLabel } from './ui';

/** 置顶、官方等状态标签，和板块标签放在同一列 */
function PostBadges({ post }: { post: Post }) {
  return (
    <>
      {post.is_pinned && <span className="TagLabel Badge--pinned" title="置顶"><Icon name="pin" /><span className="TagLabel-text">置顶</span></span>}
      {post.is_authorized && <span className="TagLabel Badge--official" title="官方"><Icon name="check" /><span className="TagLabel-text">官方</span></span>}
      {post.is_featured && <span className="TagLabel Badge--featured" title="精选"><Icon name="star" /><span className="TagLabel-text">精选</span></span>}
      {post.is_hotted && <span className="TagLabel Badge--hot" title="热门"><Icon name="fire" /><span className="TagLabel-text">热门</span></span>}
    </>
  );
}

/** Flarum 的 DiscussionListItem：头像、标题、最后回复信息、板块标签、回复数 */
export function DiscussionListItem({
  post,
  board,
  showExcerpt,
}: {
  post: Post;
  board?: { id: string; name: string };
  showExcerpt?: boolean;
}) {
  const blocked = useBlocklist();
  if (blocked.user(post.user.id) || blocked.text(post.title)) return null;
  const replied = !!post.replied_at && !!post.reply_user;
  const tag = board ?? (post.board_id && post.board_name ? { id: post.board_id, name: post.board_name } : undefined);
  const flagged = post.is_pinned || post.is_authorized || post.is_featured || post.is_hotted;
  return (
    <li className="DiscussionListItem">
      <div className="DiscussionListItem-content">
        <Link to={`/u/${post.user.id}`} className="DiscussionListItem-author" title={post.user.nickname}>
          <Avatar src={post.user.avatar_url} name={post.user.nickname} size={36} />
        </Link>
        <Link to={`/d/${post.id}`} className="DiscussionListItem-main">
          <h3 className="DiscussionListItem-title">{post.title}</h3>
          <div className="DiscussionListItem-info">
            {replied ? (
              <>
                <Icon name="reply" />
                <span className="username">{post.reply_user!.nickname}</span> 回复于 {timeAgo(post.replied_at!)}
              </>
            ) : (
              <>
                <Icon name="edit" />
                <span className="username">{post.user.nickname}</span> 发布于 {timeAgo(post.created_at)}
              </>
            )}
          </div>
          {showExcerpt && <div className="DiscussionListItem-excerpt">{htmlToText(post.content, 160)}</div>}
        </Link>
        {(tag || flagged) && (
          <span className="DiscussionListItem-tags">
            <PostBadges post={post} />
            {tag && <TagLabel id={tag.id} name={tag.name} />}
          </span>
        )}
        <span className="DiscussionListItem-stats" title={`${post.n_replies} 条回帖`}>
          <Icon name="comment" />
          {compactNumber(post.n_replies)}
        </span>
      </div>
    </li>
  );
}

export function WorkCard({ work, ignoreBlock }: { work: WorkCardData; ignoreBlock?: boolean }) {
  const blocked = useBlocklist();
  if (!ignoreBlock && (blocked.user(work.user.id) || blocked.text(work.name))) return null;
  return (
    <div className="WorkCard">
      <Link to={`/work/${work.id}`} className="WorkCard-cover">
        <img src={work.preview} alt="" loading="lazy" referrerPolicy="no-referrer" />
      </Link>
      <Link to={`/work/${work.id}`} className="WorkCard-title" title={work.name}>
        {work.name}
      </Link>
      <div className="WorkCard-meta">
        {work.user.nickname && (
          <Link to={`/u/${work.user.id}`} className="username">
            {work.user.nickname}
          </Link>
        )}
        <span className="WorkCard-stat">
          <Icon name="eye" />
          {compactNumber(work.view_times)}
        </span>
        <span className="WorkCard-stat">
          <Icon name="heart" />
          {compactNumber(work.praise_times)}
        </span>
      </div>
    </div>
  );
}

/** ignoreBlock：在被屏蔽用户自己的主页上仍然显示他的作品 */
export function WorkGrid({ works, ignoreBlock }: { works: WorkCardData[]; ignoreBlock?: boolean }) {
  return (
    <div className="WorkGrid">
      {works.map((w) => (
        <WorkCard key={w.id} work={w} ignoreBlock={ignoreBlock} />
      ))}
    </div>
  );
}

export interface UserListEntry {
  id: number | string;
  nickname: string;
  avatar_url?: string;
  info: ReactNode;
  bio?: string;
}

export function UserList({ users }: { users: UserListEntry[] }) {
  return (
    <div className="UserList">
      {users.map((u) => (
        <Link key={u.id} to={`/u/${u.id}`} className="UserList-item">
          <Avatar src={u.avatar_url} name={u.nickname} size={40} />
          <div>
            <strong>{u.nickname}</strong>
            <span>{u.info}</span>
            {u.bio && <p className="UserList-bio">{u.bio}</p>}
          </div>
        </Link>
      ))}
    </div>
  );
}
