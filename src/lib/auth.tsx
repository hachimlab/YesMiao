import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, me, users, type MyDetails } from '../api';

/** 登录态以 httpOnly cookie 保存在代理域名下，页面只能通过 /web/users/details 判断是否登录 */
export function useMe() {
  const qc = useQueryClient();
  const q = useQuery<MyDetails | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await me.details();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const id = q.data?.id;

  // 空闲时预取自己的主页信息，进个人中心时不用再等一轮请求。
  // 消息列表不能预取：打开即会被编程猫标记为已读
  useEffect(() => {
    if (!id) return;
    const prefetch = () => qc.prefetchQuery({ queryKey: ['honor', String(id)], queryFn: () => users.honor(String(id)) });
    if (typeof requestIdleCallback !== 'function') return void prefetch();
    const handle = requestIdleCallback(prefetch, { timeout: 3000 });
    return () => cancelIdleCallback(handle);
  }, [qc, id]);

  return { user: q.data ?? null, loading: q.isLoading };
}

export function useAuthActions() {
  const qc = useQueryClient();
  return {
    async login(identity: string, password: string) {
      await me.login(identity, password);
      await qc.invalidateQueries();
    },
    async logout() {
      await me.logout();
      // 清掉内存和 localStorage 里的全部缓存，不给下一个人留下个人数据
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  };
}
