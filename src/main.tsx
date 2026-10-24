import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider, removeOldestQuery, type PersistedClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { createBrowserRouter, Link, Navigate, RouterProvider, useParams, useRouteError } from 'react-router-dom';
import Layout from './components/Layout';
import IndexPage from './pages/forum/IndexPage';
import DiscussionPage from './pages/forum/DiscussionPage';
import SearchPage from './pages/forum/SearchPage';
import WorksPage from './pages/works/WorksPage';
import WorkPage from './pages/works/WorkPage';
import UserPage from './pages/user/UserPage';
import MePage, { LoginPage } from './pages/me/MePage';
import AppearancePage from './pages/settings/AppearancePage';
import './styles.css';

const CACHE_MAX_AGE = 24 * 3600_000;

const queryClient = new QueryClient({
  defaultOptions: {
    // 所有请求都会消耗边缘函数额度，适当放长缓存时间
    // gcTime 不能小于持久化的 maxAge，否则查询被回收后就不会写进 localStorage
    queries: { staleTime: 60_000, gcTime: CACHE_MAX_AGE, refetchOnWindowFocus: false, retry: 1 },
  },
});

/** 列表只存第一页：恢复后重新拉取时只需请求一页，也能控制 localStorage 体积 */
function trimInfinitePages(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries.map((q) => {
    const data = q.state.data as { pages?: unknown[]; pageParams?: unknown[] } | undefined;
    if (!data?.pages || data.pages.length <= 1) return q;
    return { ...q, state: { ...q.state, data: { pages: data.pages.slice(0, 1), pageParams: data.pageParams?.slice(0, 1) } } };
  });
  return { ...client, clientState: { ...client.clientState, queries } };
}

// 刷新页面后先用 localStorage 里的旧数据渲染，再在后台重新请求（数据已过 staleTime）
const persister = createSyncStoragePersister({
  // 隐私模式等情况下访问 localStorage 可能抛错，此时不做持久化
  storage: (() => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  })(),
  key: 'yesmiao-query-cache',
  throttleTime: 1000,
  serialize: (client) => JSON.stringify(trimInfinitePages(client)),
  retry: removeOldestQuery,
});

function NotFound() {
  return (
    <div className="Placeholder">
      <p>页面不存在</p>
      <Link to="/">回到首页</Link>
    </div>
  );
}

function RouteError() {
  console.error(useRouteError());
  return (
    <div className="Placeholder Placeholder--error">
      <p>页面出错了</p>
      <a href="/">回到首页</a>
    </div>
  );
}

/** 兼容官方社区和旧版本的链接 */
function Redirect({ to }: { to: (id: string) => string }) {
  const { id = '' } = useParams();
  return <Navigate to={to(id)} replace />;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <IndexPage /> },
      { path: '/t/:boardId', element: <IndexPage /> },
      { path: '/d/:postId', element: <DiscussionPage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/works', element: <WorksPage /> },
      { path: '/work/:workId', element: <WorkPage /> },
      { path: '/u/:userId/:tab?', element: <UserPage /> },
      { path: '/me/:section?', element: <MePage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/settings', element: <AppearancePage /> },
      { path: '/community/:id', element: <Redirect to={(id) => `/d/${id}`} /> },
      { path: '/forum/post/:id', element: <Redirect to={(id) => `/d/${id}`} /> },
      { path: '/forum/board/:id', element: <Redirect to={(id) => `/t/${id}`} /> },
      { path: '/user/:id', element: <Redirect to={(id) => `/u/${id}`} /> },
      { path: '/forum', element: <Navigate to="/" replace /> },
      { path: '*', element: <NotFound /> },
    ].map((r) => ({ ...r, errorElement: <RouteError /> })),
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        // 接口数据结构变了就改这个值，丢弃旧缓存
        buster: 'v1',
        dehydrateOptions: {
          // 搜索结果复用率低，不占 localStorage
          shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) && q.queryKey[0] !== 'search',
        },
      }}
    >
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
);
