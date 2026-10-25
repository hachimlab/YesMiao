import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { forum, type Board, type Post } from '../../api';
import { DiscussionListItem } from '../../components/cards';
import { Icon, type IconName } from '../../components/icons';
import { useOverlays } from '../../components/overlays';
import { Button, ListState, RssButton, SideNav, boardColor, textToHtml, useLoadMore } from '../../components/ui';
import { RULES } from '../../lib/limits';

type Feed = 'hot' | 'selection' | 'help' | 'latest';

const HOME_FEEDS: { value: Feed; label: string; icon: IconName }[] = [
  { value: 'hot', label: '热门讨论', icon: 'fire' },
  { value: 'selection', label: '精选', icon: 'star' },
  { value: 'help', label: '求助', icon: 'help' },
];

export function useBoards() {
  return useQuery({ queryKey: ['boards'], queryFn: forum.boards, staleTime: 3600_000 });
}

/** 打开“发起讨论”编辑器，发布后跳到新帖子 */
export function useStartDiscussion() {
  const { openComposer } = useOverlays();
  const { data: boards } = useBoards();
  const navigate = useNavigate();
  return (boardId?: string) =>
    openComposer({
      heading: <strong>发起讨论</strong>,
      placeholder: '写下正文，空一行分段。发帖需要账号已绑定手机号。',
      submitLabel: '发布讨论',
      rule: RULES.post,
      discussion: { boards: boards ?? [], boardId: boardId ?? boards?.[0]?.id ?? '2' },
      onSubmit: async ({ text, title, boardId: target }) => {
        const { id } = await forum.createPost(target, title, textToHtml(text));
        navigate(`/d/${id}`);
      },
    });
}

export function IndexSidebar({ boardId, feed }: { boardId?: string; feed?: Feed }) {
  const { data: boards } = useBoards();
  const startDiscussion = useStartDiscussion();
  return (
    <aside className="Page-sidebar">
      <Button variant="primary" block icon="edit" onClick={() => startDiscussion(boardId)}>
        发起讨论
      </Button>
      <SideNav>
        {HOME_FEEDS.map((f) => (
          <li key={f.value}>
            <Link to={f.value === 'hot' ? '/' : `/?sort=${f.value}`} className={!boardId && feed === f.value ? 'active' : ''}>
              <Icon name={f.icon} />
              {f.label}
            </Link>
          </li>
        ))}
        <li className="sideNav-separator" />
        {boards?.map((b) => (
          <li key={b.id}>
            <NavLink to={`/t/${b.id}`}>
              <span className="TagIcon" style={{ background: boardColor(b.id) }} />
              {b.name}
            </NavLink>
          </li>
        ))}
      </SideNav>
    </aside>
  );
}

/** 热门是按热度排的 ID 列表，不适合做成按时间更新的订阅源 */
function rssFeed(feed: Feed, board?: { id: string; name: string }): { path: string; title: string } | undefined {
  if (board) {
    return feed === 'selection'
      ? { path: `/rss/t/${board.id}/featured.xml`, title: `${board.name} · 精选` }
      : { path: `/rss/t/${board.id}.xml`, title: board.name };
  }
  if (feed === 'selection') return { path: '/rss/featured.xml', title: '全站精选' };
  if (feed === 'help') return { path: '/rss/help.xml', title: '求助' };
}

function fetchFeed(feed: Feed, page: number, boardId: string | undefined, hotIds: () => Promise<string[]>) {
  if (boardId) return feed === 'selection' ? forum.selections(page, boardId) : forum.boardPosts(boardId, page);
  if (feed === 'selection') return forum.selections(page);
  if (feed === 'help') return forum.askHelp(page);
  return hotIds().then((ids) => forum.hot(page, ids));
}

export default function IndexPage() {
  const { boardId } = useParams();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const startDiscussion = useStartDiscussion();
  const feed: Feed = (params.get('sort') as Feed) || (boardId ? 'latest' : 'hot');
  const { data: boards } = useBoards();
  const board = boards?.find((b) => b.id === boardId);
  const boardDetail = useQuery({ queryKey: ['board', boardId], queryFn: () => forum.board(boardId!), enabled: !!boardId });

  const hotIds = () => qc.fetchQuery({ queryKey: ['hot-ids'], queryFn: forum.hotIds, staleTime: 300_000 });
  const list = useLoadMore<Post>(['discussions', boardId ?? 'home', feed], (page) => fetchFeed(feed, page, boardId, hotIds));
  const boardName = boardDetail.data?.name ?? board?.name;
  const rss = boardId ? (boardName ? rssFeed(feed, { id: boardId, name: boardName }) : undefined) : rssFeed(feed);

  return (
    <div className="IndexPage">
      <div className="container">
        {boardId && <BoardHeader board={boardDetail.data ?? board} />}
        <div className="Page-container">
          <IndexSidebar boardId={boardId} feed={feed} />
          <div className="Page-content">
            <div className="IndexPage-toolbar">
              {boardId ? (
                <div className="ButtonGroup">
                  <Button className={feed === 'latest' ? 'active' : ''} onClick={() => setParams({})}>
                    最新
                  </Button>
                  <Button className={feed === 'selection' ? 'active' : ''} onClick={() => setParams({ sort: 'selection' })}>
                    精选
                  </Button>
                </div>
              ) : (
                <span className="muted">{HOME_FEEDS.find((f) => f.value === feed)?.label}</span>
              )}
              <div className="IndexPage-toolbar-action">
                {rss && <RssButton path={rss.path} title={`YesMiao · ${rss.title}`} />}
                <Button icon="refresh" title="刷新" onClick={() => list.refetch()} disabled={list.isRefetching} />
              </div>
            </div>
            <ul className="DiscussionList">
              <ListState list={list} empty="还没有讨论">
                {(items) =>
                  items.map((p) => (
                    <DiscussionListItem key={p.id} post={p} board={board ? { id: board.id, name: board.name } : undefined} />
                  ))
                }
              </ListState>
            </ul>
          </div>
        </div>
      </div>
      <button className="MobileFab" aria-label="发起讨论" onClick={() => startDiscussion(boardId)}>
        <Icon name="edit" />
      </button>
    </div>
  );
}

/** 板块页顶部：和帖子页一样的左对齐大标题 */
function BoardHeader({ board }: { board?: Board }) {
  return (
    <div className="BoardHeader">
      <h1>{board?.name ?? '\u00a0'}</h1>
      {board?.description && <p>{board.description}</p>}
    </div>
  );
}
