import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApiError, type Paged } from '../api';
import { compactNumber } from '../lib/format';
import { Icon, type IconName } from './icons';

/* ---------- 头像：图片加载失败时退回 Flarum 风格的首字母头像 ---------- */

function hashHue(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const DEFAULT_AVATAR_RE = /community_default_avatar|avatar\/default/;

export function Avatar({ src, name = '', size = 36 }: { src?: string; name?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size / 2), lineHeight: `${size}px` };
  if (!src || failed || DEFAULT_AVATAR_RE.test(src)) {
    return (
      <span className="Avatar Avatar--letter" style={{ ...style, background: `hsl(${hashHue(name)}, 40%, 68%)` }} aria-hidden>
        {[...name.trim()][0]?.toUpperCase() || '?'}
      </span>
    );
  }
  return (
    <img
      className="Avatar"
      src={src}
      style={style}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function Username({ id, name }: { id: string | number; name: string }) {
  return (
    <Link to={`/u/${id}`} className="username">
      {name}
    </Link>
  );
}

/* ---------- 板块颜色（Flarum 的标签色） ---------- */

const TAG_COLORS = ['#e74c3c', '#3498db', '#27ae60', '#9b59b6', '#f39c12', '#16a085', '#c0392b', '#2980b9', '#d35400', '#8e44ad', '#1abc9c', '#e67e22', '#7f8c8d', '#2c3e50', '#c2185b'];

export function boardColor(id: string | number | undefined) {
  if (id === undefined) return '#888';
  return TAG_COLORS[Number(id) % TAG_COLORS.length];
}

export function TagLabel({ id, name, inverted }: { id: string | number; name: string; inverted?: boolean }) {
  const color = boardColor(id);
  return (
    <Link
      to={`/t/${id}`}
      className={`TagLabel${inverted ? ' TagLabel--inverted' : ''}`}
      style={inverted ? { color } : { background: color }}
    >
      {name}
    </Link>
  );
}

/** Discourse 式的分类徽标：色块 + 名称 */
export function CategoryBadge({ id, name }: { id: string | number; name: string }) {
  return (
    <Link to={`/t/${id}`} className="CategoryBadge">
      <span className="CategoryBadge-swatch" style={{ background: boardColor(id) }} />
      {name}
    </Link>
  );
}

/* ---------- 按钮 ---------- */

export function Button({
  icon,
  children,
  variant,
  block,
  className = '',
  ...rest
}: {
  icon?: IconName;
  variant?: 'primary' | 'text' | 'link';
  block?: boolean;
  children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ['Button', variant && `Button--${variant}`, block && 'Button--block', !children && 'Button--icon', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {children && <span className="Button-label">{children}</span>}
    </button>
  );
}

/* ---------- 状态 ---------- */

export function Loading() {
  return (
    <div className="LoadingIndicator" aria-label="加载中">
      <span className="spinner" />
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : '网络错误，请稍后再试';
  return (
    <div className="Placeholder Placeholder--error">
      <p>{message}</p>
      {onRetry && <Button onClick={onRetry}>重试</Button>}
    </div>
  );
}

export function Empty({ children = '这里还什么都没有' }: { children?: ReactNode }) {
  return (
    <div className="Placeholder">
      <p>{children}</p>
    </div>
  );
}

/* ---------- 列表：滚动到底自动加载，代替分页 ---------- */

export function useLoadMore<T>(key: QueryKey, fetchPage: (page: number) => Promise<Paged<T>>, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 1,
    enabled,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((s, p) => s + p.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? all.length + 1 : undefined;
    },
  });
  return { ...q, items: q.data?.pages.flatMap((p) => p.items) ?? [], total: q.data?.pages[0]?.total ?? 0 };
}

/** 快滚到底部就自动加载下一页；加载失败时停下，改成按钮让用户手动重试 */
function LoadMore({ list }: { list: ReturnType<typeof useLoadMore<unknown>> }) {
  const ref = useRef<HTMLDivElement>(null);
  const { fetchNextPage, isFetchingNextPage, isFetchNextPageError } = list;
  useEffect(() => {
    if (isFetchingNextPage || isFetchNextPageError || !ref.current) return;
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && fetchNextPage(), { rootMargin: '800px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
  return (
    <div className="LoadMore" ref={ref}>
      {isFetchNextPageError && !isFetchingNextPage ? (
        <Button onClick={() => fetchNextPage()}>加载失败，点击重试</Button>
      ) : (
        <Loading />
      )}
    </div>
  );
}

export function ListState<T>({
  list,
  empty,
  children,
}: {
  list: ReturnType<typeof useLoadMore<T>>;
  empty?: ReactNode;
  children: (items: T[]) => ReactNode;
}) {
  if (list.isLoading) return <Loading />;
  if (list.error && !list.items.length) return <ErrorBox error={list.error} onRetry={() => list.refetch()} />;
  if (!list.items.length) return <Empty>{empty}</Empty>;
  return (
    <>
      {children(list.items)}
      {list.hasNextPage && <LoadMore list={list as ReturnType<typeof useLoadMore<unknown>>} />}
    </>
  );
}

/* ---------- 二级页面：Discourse 式的标题 + 楼层操作 ---------- */

export function TopicTitle({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="TopicTitle">
      <h1>{title}</h1>
      {children && <div className="TopicTitle-meta">{children}</div>}
    </div>
  );
}

/** 楼层右下角的图标按钮，数字在图标左边 */
export function PostAction({
  icon,
  label,
  count,
  active,
  className = '',
  ...rest
}: { icon: IconName; label: string; count?: number; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`PostAction${active ? ' active' : ''} ${className}`} title={label} aria-label={label} aria-pressed={active} {...rest}>
      {!!count && <span className="PostAction-count">{compactNumber(count)}</span>}
      <Icon name={icon} size={16} />
    </button>
  );
}

/** 被屏蔽的用户或关键词命中的回帖、评论，折叠成一行 */
export function HiddenItem({ onShow }: { onShow: () => void }) {
  return (
    <div className="HiddenItem">
      已隐藏一条内容（来自屏蔽的用户或包含屏蔽词）
      <button onClick={onShow}>显示</button>
    </div>
  );
}

/* ---------- 侧边导航（Flarum 的 sideNav） ---------- */

export function SideNav({ children }: { children: ReactNode }) {
  return (
    <nav className="sideNav">
      <ul>{children}</ul>
    </nav>
  );
}

/**
 * 纯文本转成编程猫接受的简单 HTML。和官方编辑器一致：每行一个段落，空行写成 <p>&nbsp;</p>，
 * 这样在本站（段落无间距）和官方社区显示得一样
 */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split('\n')
    .map((line) => (line.trim() ? `<p>${esc(line)}</p>` : '<p>&nbsp;</p>'))
    .join('');
}
