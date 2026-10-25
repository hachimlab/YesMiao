import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, useParams } from 'react-router-dom';
import { userdb, users, type FollowUser, type Paged, type UserHonor, type WorkCardData } from '../../api';
import { UserList, WorkGrid } from '../../components/cards';
import { Icon, type IconName } from '../../components/icons';
import { Avatar, Button, ErrorBox, ListState, Loading, RssButton, useLoadMore } from '../../components/ui';
import { blockUser, unblockUser, useBlocklist } from '../../lib/appearance';
import { useMe } from '../../lib/auth';
import { compactNumber } from '../../lib/format';

function FollowButton({ honor }: { honor: UserHonor }) {
  const { user } = useMe();
  const [following, setFollowing] = useState(honor.attention_status);
  if (!user || String(user.id) === String(honor.user_id)) return null;
  return (
    <Button
      variant={following ? undefined : 'primary'}
      onClick={async () => {
        setFollowing(!following);
        try {
          await users.follow(String(honor.user_id), !following);
        } catch {
          setFollowing(following);
        }
      }}
    >
      {following ? '已关注' : '关注'}
    </Button>
  );
}

/** 屏蔽只存在本机：隐藏这个人的帖子、回帖、评论和作品，不需要登录 */
function BlockButton({ honor }: { honor: UserHonor }) {
  const { user } = useMe();
  const blocked = useBlocklist().user(honor.user_id);
  if (user && String(user.id) === String(honor.user_id)) return null;
  return (
    <Button
      className={blocked ? 'active' : ''}
      title={blocked ? '取消屏蔽' : '在本机隐藏这个用户发的内容'}
      onClick={() => (blocked ? unblockUser(honor.user_id) : blockUser({ id: honor.user_id, nickname: honor.nickname }))}
    >
      {blocked ? '已屏蔽' : '屏蔽'}
    </Button>
  );
}

/** Discourse 式的个人资料头：大头像 + 名字 + 简介，下面一行统计 */
export function UserHeader({ honor, actions }: { honor: UserHonor; actions?: ReactNode }) {
  const stats = [
    { label: '粉丝', value: honor.fans_total },
    { label: '关注', value: honor.attention_total },
    { label: '获赞', value: honor.liked_total },
    { label: '被浏览', value: honor.view_times },
    { label: '被收藏', value: honor.collected_total },
    { label: '被再创作', value: honor.re_created_total },
  ];
  return (
    <section className="UserHeader">
      <div className="UserHeader-main">
        <Avatar src={honor.avatar_url} name={honor.nickname} size={120} />
        <div className="UserHeader-info">
          <h1>{honor.nickname}</h1>
          <div className="UserHeader-flair">
            {honor.is_official_certification ? <span className="Badge Badge--author">官方认证</span> : null}
            {honor.author_level ? <span className="Badge Badge--author">Lv{honor.author_level}</span> : null}
            {honor.work_shop_name && <span>工作室：{honor.work_shop_name}</span>}
          </div>
          {honor.user_description && <p className="UserHeader-bio">{honor.user_description}</p>}
        </div>
        <div className="UserHeader-actions">
          {actions ?? (
            <>
              <FollowButton honor={honor} />
              <BlockButton honor={honor} />
              <RssButton path={`/rss/u/${honor.user_id}.xml`} title={`YesMiao · ${honor.nickname} 的作品`} />
            </>
          )}
        </div>
      </div>
      <dl className="UserHeader-stats">
        {stats.map((s) => (
          <div key={s.label}>
            <dt>{s.label}</dt>
            <dd>{compactNumber(s.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** 个人页的横向导航（Discourse 的 nav-pills） */
export function UserNav({ children }: { children: ReactNode }) {
  return <nav className="UserNav">{children}</nav>;
}

type Tab = 'works' | 'collections' | 'fans' | 'following';

const TABS: { value: Tab; label: string; icon: IconName; count?: (h: UserHonor) => number }[] = [
  { value: 'works', label: '作品', icon: 'grid' },
  { value: 'collections', label: '收藏', icon: 'bookmark' },
  { value: 'fans', label: '粉丝', icon: 'users', count: (h) => h.fans_total },
  { value: 'following', label: '关注', icon: 'user', count: (h) => h.attention_total },
];

async function fetchTab(userId: string, tab: Tab, page: number): Promise<Paged<WorkCardData | FollowUser>> {
  if (tab === 'works') {
    const d = await users.works(userId, page);
    return {
      ...d,
      items: d.items.map((w) => ({ id: w.id, name: w.work_name, preview: w.preview, view_times: w.view_times, praise_times: w.liked_times, user: { id: userId, nickname: '' } })),
    };
  }
  if (tab === 'collections') {
    const d = await users.collections(userId, page);
    return {
      ...d,
      items: d.items.map((w) => ({ id: w.id, name: w.name, preview: w.preview, view_times: w.views_count, praise_times: w.likes_count, user: { id: w.user_id, nickname: w.nickname, avatar_url: w.avatar_url } })),
    };
  }
  return tab === 'fans' ? users.fans(userId, page) : users.following(userId, page);
}

export default function UserPage() {
  const { userId = '', tab: tabParam } = useParams();
  const tab = (TABS.find((t) => t.value === tabParam)?.value ?? 'works') as Tab;
  const honor = useQuery({ queryKey: ['honor', userId], queryFn: () => users.honor(userId) });
  const list = useLoadMore<WorkCardData | FollowUser>(['user', userId, tab], (page) => fetchTab(userId, tab, page));
  const loadedId = honor.data?.user_id;
  // 和 UserDB 油猴插件一样，访问主页时顺手把这个用户同步进昵称搜索库
  useEffect(() => {
    if (loadedId) userdb.record(String(loadedId));
  }, [loadedId]);

  if (honor.error) return <div className="container"><ErrorBox error={honor.error} onRetry={() => honor.refetch()} /></div>;
  if (!honor.data) return <Loading />;
  const h = honor.data;
  const isUsers = tab === 'fans' || tab === 'following';

  return (
    <div className="UserPage container">
      <UserHeader honor={h} />
      <UserNav>
        {TABS.map((t) => (
          <NavLink key={t.value} to={t.value === 'works' ? `/u/${userId}` : `/u/${userId}/${t.value}`} end>
            <Icon name={t.icon} />
            {t.label}
            {t.count && <span className="UserNav-count">{compactNumber(t.count(h))}</span>}
          </NavLink>
        ))}
      </UserNav>
      <div className="UserPage-content">
        <ListState list={list} empty={isUsers ? '还没有人' : '还没有作品'}>
          {(items) => (isUsers ? <UserList
                users={(items as FollowUser[]).map((u) => ({
                  ...u,
                  info: `${u.n_works} 个作品 · ${compactNumber(u.total_likes)} 获赞`,
                }))}
              /> : <WorkGrid works={items as WorkCardData[]} ignoreBlock={tab === 'works'} />)}
        </ListState>
      </div>
    </div>
  );
}
