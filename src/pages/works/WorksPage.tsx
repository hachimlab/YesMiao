import { Link, useSearchParams } from 'react-router-dom';
import { works, type Paged, type WorkCardData } from '../../api';
import { WorkGrid } from '../../components/cards';
import { Icon, type IconName } from '../../components/icons';
import { Button, ListState, SideNav, useLoadMore } from '../../components/ui';
import { updateAppearance, useAppearance, WORK_VIEWS } from '../../lib/appearance';

type Feed = 'featured' | 'hot' | 'views' | 'newest';

const FEEDS: { value: Feed; label: string; icon: IconName }[] = [
  { value: 'featured', label: '精选作品', icon: 'star' },
  { value: 'hot', label: '热门作品', icon: 'fire' },
  { value: 'views', label: '最多点击', icon: 'eye' },
  { value: 'newest', label: '最新发布', icon: 'list' },
];

async function fetchFeed(feed: Feed, page: number): Promise<Paged<WorkCardData>> {
  if (feed === 'featured' || feed === 'hot') {
    const items = await works.recommended(feed === 'featured' ? 1 : 2);
    return { items, offset: 0, limit: items.length, total: items.length };
  }
  if (feed === 'views') {
    // 这个接口最多返回前 3000 个
    const d = await works.discovery('VIEW_TIMES', page);
    return { ...d, total: Math.min(d.total, 3000) };
  }
  return works.newest(page);
}

export default function WorksPage() {
  const [params] = useSearchParams();
  const feed = (params.get('feed') as Feed) || 'featured';
  const list = useLoadMore<WorkCardData>(['works', feed], (page) => fetchFeed(feed, page));
  const { workView } = useAppearance();

  return (
    <>
      <div className="PickcatBanner">
        推荐前往 Pickcat 社区查看作品
        <a href="https://pickcat.dao3.fun/works" target="_blank" rel="noopener noreferrer">
          点击前往 →
        </a>
      </div>
      <div className="container">
        <div className="Page-container">
          <aside className="Page-sidebar">
            <SideNav>
              {FEEDS.map((f) => (
                <li key={f.value}>
                  <Link to={f.value === 'featured' ? '/works' : `/works?feed=${f.value}`} className={feed === f.value ? 'active' : ''}>
                    <Icon name={f.icon} />
                    {f.label}
                  </Link>
                </li>
              ))}
            </SideNav>
          </aside>
          <div className="Page-content">
            <div className="IndexPage-toolbar">
              <span className="muted">{FEEDS.find((f) => f.value === feed)?.label}</span>
              <div className="IndexPage-toolbar-action">
                <div className="ButtonGroup" aria-label="作品布局">
                  {WORK_VIEWS.map((v) => (
                    <Button
                      key={v.value}
                      icon={v.icon}
                      title={v.label}
                      aria-label={v.label}
                      aria-pressed={workView === v.value}
                      className={workView === v.value ? 'active' : ''}
                      onClick={() => updateAppearance({ workView: v.value })}
                    />
                  ))}
                </div>
                <Button icon="refresh" title="刷新" onClick={() => list.refetch()} disabled={list.isRefetching} />
              </div>
            </div>
            <ListState list={list} empty="暂无作品">
              {(items) => <WorkGrid works={items} />}
            </ListState>
          </div>
        </div>
      </div>
    </>
  );
}
