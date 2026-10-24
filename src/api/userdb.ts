// CodemaoUserDB（https://github.com/hachimlab/UserDB）：HachimLab 维护的编程猫公开用户资料库，
// 弥补编程猫不能按昵称找人的不足。接口允许任意来源跨域，浏览器直接调用，不经过本站代理。
import { ApiError } from './client';
import type { Paged } from './types';

const USERDB = 'https://udbapi.hachimlab.top';
export const USERDB_HOME = 'https://userdb.hachimlab.top/';
const SEARCH_LIMIT = 20;
/** 同一个用户 10 分钟内只同步一次，和官方油猴插件一致 */
const RECORD_THROTTLE = 10 * 60 * 1000;

export interface UserDBUser {
  id: number;
  nickname: string;
  /** 0 女，1 男 */
  sex: number;
  description: string;
  doing: string;
  level: number;
  avatar: string;
  collectionTimes: number;
  forkedTimes: number;
  praiseTimes: number;
  viewTimes: number;
  attention_total: number;
  fans_total: number;
  work_shop_name: string;
}

function get(path: string, query: Record<string, string | number>) {
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
  return fetch(`${USERDB}${path}?${qs}`, { credentials: 'omit', referrerPolicy: 'no-referrer' });
}

export const userdb = {
  /** 按昵称模糊搜索；没有结果时接口返回 404 */
  search: async (nickname: string, page: number): Promise<Paged<UserDBUser>> => {
    const res = await get('/search', { nickname, page, limit: SEARCH_LIMIT });
    const empty = { items: [], offset: (page - 1) * SEARCH_LIMIT, limit: SEARCH_LIMIT, total: 0 };
    if (res.status === 404) return empty;
    if (!res.ok) throw new ApiError(`用户搜索服务暂不可用（${res.status}）`, res.status);
    const data: { status: string; user?: number; items?: UserDBUser[] } = await res.json();
    if (data.status !== 'ok') return empty;
    return { ...empty, items: data.items ?? [], total: data.user ?? 0 };
  },

  /** 打开个人主页时把该用户同步到 UserDB：先尝试更新，未收录（404）再添加。失败不影响页面 */
  record: async (id: string) => {
    const key = `ym_userdb_${id}`;
    try {
      const last = Number(localStorage.getItem(key));
      if (last && Date.now() - last < RECORD_THROTTLE) return;
    } catch {
      // 存储不可用时照常同步
    }
    try {
      let res = await get('/user/update', { id });
      if (res.status === 404) res = await get('/user/add', { id });
      // 409 已收录、422 疑似 EDU 账号，都不需要短时间内重试
      if (res.ok || res.status === 409 || res.status === 422) localStorage.setItem(key, String(Date.now()));
    } catch {
      // 忽略
    }
  },
};
