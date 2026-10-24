import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { forum, userdb, USERDB_HOME, works, type Post, type UserDBUser, type WorkCardData } from '../../api';
import { DiscussionListItem, UserList, WorkGrid } from '../../components/cards';
import { Icon, type IconName } from '../../components/icons';
import { ListState, SideNav, useLoadMore } from '../../components/ui';
import { compactNumber } from '../../lib/format';

export type SearchType = 'posts' | 'works' | 'users';

const TYPES: { value: SearchType; label: string; icon: IconName }[] = [
  { value: 'posts', label: '讨论', icon: 'comment' },
  { value: 'works', label: '作品', icon: 'grid' },
  { value: 'users', label: '用户', icon: 'users' },
];

export function searchUrl(keyword: string, type?: SearchType) {
  const qs = new URLSearchParams({ q: keyword });
  if (type && type !== 'posts') qs.set('type', type);
  return `/search?${qs}`;
}

function Summary({ keyword, by, total, loaded }: { keyword: string; by: string; total: number; loaded: boolean }) {
  return (
    <div className="IndexPage-toolbar">
      <span className="muted">
        {by}搜索“<strong>{keyword}</strong>”{loaded ? `，共 ${total} 个结果` : ''}
      </span>
    </div>
  );
}

function PostResults({ keyword }: { keyword: string }) {
  const list = useLoadMore<Post>(['search', 'posts', keyword], (page) => forum.search(keyword, page));
  return (
    <>
      <Summary keyword={keyword} by="按标题" total={list.total} loaded={!!list.data} />
      <ul className="DiscussionList">
        <ListState list={list} empty="没有找到相关讨论">
          {(items) => items.map((p) => <DiscussionListItem key={p.id} post={p} showExcerpt />)}
        </ListState>
      </ul>
    </>
  );
}

function WorkResults({ keyword }: { keyword: string }) {
  const list = useLoadMore<WorkCardData>(['search', 'works', keyword], (page) => works.search(keyword, page));
  return (
    <>
      <Summary keyword={keyword} by="按作品名" total={list.total} loaded={!!list.data} />
      <ListState list={list} empty="没有找到相关作品">
        {(items) => <WorkGrid works={items} />}
      </ListState>
    </>
  );
}

function UserResults({ keyword }: { keyword: string }) {
  const list = useLoadMore<UserDBUser>(['search', 'users', keyword], (page) => userdb.search(keyword, page));
  // UserDB 只收录了部分用户，输入的是数字时给一个直达入口
  const byId: ReactNode = /^\d{1,12}$/.test(keyword) && (
    <p>
      <Link to={`/u/${keyword}`}>
        <Icon name="user" /> 打开用户 ID {keyword} 的主页
      </Link>
    </p>
  );
  return (
    <>
      <Summary keyword={keyword} by="按昵称" total={list.total} loaded={!!list.data} />
      {byId}
      <ListState list={list} empty="没有找到相关用户">
        {(items) => (
          <UserList
            users={items.map((u) => ({
              id: u.id,
              nickname: u.nickname,
              avatar_url: u.avatar,
              info: `${compactNumber(u.fans_total)} 粉丝 · ${compactNumber(u.praiseTimes)} 获赞`,
              bio: u.description,
            }))}
          />
        )}
      </ListState>
      <p className="SearchPage-note">
        用户数据来自{' '}
        <a href={USERDB_HOME} target="_blank" rel="noreferrer">
          CodemaoUserDB
        </a>
        ，只收录了部分用户，资料可能不是最新。打开用户主页时会自动把该用户同步进去。
      </p>
    </>
  );
}

export default function SearchPage() {
  const [params] = useSearchParams();
  const keyword = params.get('q')?.trim() || '';
  const type = TYPES.find((t) => t.value === params.get('type'))?.value ?? 'posts';

  return (
    <div className="container">
      <div className="Page-container">
        <aside className="Page-sidebar">
          <SideNav>
            {TYPES.map((t) => (
              <li key={t.value}>
                <Link to={searchUrl(keyword, t.value)} className={type === t.value ? 'active' : ''}>
                  <Icon name={t.icon} />
                  {t.label}
                </Link>
              </li>
            ))}
          </SideNav>
        </aside>
        <div className="Page-content">
          {!keyword ? (
            <div className="Placeholder">
              <p>输入关键词搜索讨论、作品或用户</p>
            </div>
          ) : type === 'works' ? (
            <WorkResults keyword={keyword} />
          ) : type === 'users' ? (
            <UserResults keyword={keyword} />
          ) : (
            <PostResults keyword={keyword} />
          )}
        </div>
      </div>
    </div>
  );
}
