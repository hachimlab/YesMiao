import { useMemo, useSyncExternalStore } from 'react';
import type { IconName } from '../components/icons';
import { htmlToText } from './format';

/**
 * 外观设置：只存在本机 localStorage（编程猫没有地方存这些偏好，所以不能跨设备同步，改用导出/导入）。
 * 真正把设置写到页面上的 apply 在 index.html 的内联脚本里，首屏前和之后的修改共用它
 */

export type ThemeMode = 'auto' | 'light' | 'dark';
export type FontSize = 'sm' | 'md' | 'lg' | 'xl';
export type Density = 'compact' | 'normal' | 'comfy';
export type Radius = 'square' | 'normal' | 'round';
export type WorkView = 'small' | 'grid' | 'large' | 'list';
export type Motion = 'auto' | 'reduce' | 'full';

export interface BlockedUser {
  id: string;
  nickname: string;
}

export interface Appearance {
  theme: ThemeMode;
  /** null 表示默认主题色 DEFAULT_ACCENT */
  accent: string | null;
  fontSize: FontSize;
  /** null 表示各处用自己的默认行距 */
  lineHeight: number | null;
  serif: boolean;
  density: Density;
  radius: Radius;
  workView: WorkView;
  /** upload 的图片数据单独存在 BG_KEY 里，不跟着设置一起反复序列化 */
  background: { kind: 'none' | 'url' | 'upload'; url: string; blur: number; dim: number };
  glass: boolean;
  motion: Motion;
  customCss: string;
  hideAvatars: boolean;
  hideCounts: boolean;
  blockedUsers: BlockedUser[];
  blockedKeywords: string[];
}

interface Boot {
  apply(s: Appearance): void;
  load(): unknown;
  safe: boolean;
  KEY: string;
  BG_KEY: string;
}

declare global {
  interface Window {
    YesMiaoAppearance: Boot;
  }
}

const boot = window.YesMiaoAppearance;

/** 是否处于 ?nostyle 安全模式（跳过自定义 CSS 和背景图） */
export const safeMode = boot.safe;

/** 默认主题色，index.html 的内联脚本里也写了一份 */
export const DEFAULT_ACCENT = '#fec433';

export const DEFAULTS: Appearance = {
  theme: 'auto',
  accent: null,
  fontSize: 'md',
  lineHeight: null,
  serif: false,
  density: 'normal',
  radius: 'normal',
  workView: 'grid',
  background: { kind: 'none', url: '', blur: 0, dim: 0.8 },
  glass: false,
  motion: 'auto',
  customCss: '',
  hideAvatars: false,
  hideCounts: false,
  blockedUsers: [],
  blockedKeywords: [],
};

function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

function clamp(v: unknown, min: number, max: number, fallback: number) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** localStorage 和导入的文件都可能是旧版本或被手改过的数据，逐项校验，不认识的值回到默认 */
export function normalize(raw: unknown): Appearance {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bg = (r.background && typeof r.background === 'object' ? r.background : {}) as Record<string, unknown>;
  const d = DEFAULTS;
  return {
    theme: oneOf(r.theme, ['auto', 'light', 'dark'], d.theme),
    accent: typeof r.accent === 'string' && /^#[0-9a-f]{6}$/i.test(r.accent) ? r.accent.toLowerCase() : null,
    fontSize: oneOf(r.fontSize, ['sm', 'md', 'lg', 'xl'], d.fontSize),
    lineHeight: r.lineHeight === null || r.lineHeight === undefined ? null : clamp(r.lineHeight, 1.3, 2.4, 1.8),
    serif: r.serif === true,
    density: oneOf(r.density, ['compact', 'normal', 'comfy'], d.density),
    radius: oneOf(r.radius, ['square', 'normal', 'round'], d.radius),
    workView: oneOf(r.workView, ['small', 'grid', 'large', 'list'], d.workView),
    background: {
      kind: oneOf(bg.kind, ['none', 'url', 'upload'], 'none'),
      url: typeof bg.url === 'string' ? bg.url : '',
      blur: clamp(bg.blur, 0, 30, d.background.blur),
      dim: clamp(bg.dim, 0.3, 0.97, d.background.dim),
    },
    glass: r.glass === true,
    motion: oneOf(r.motion, ['auto', 'reduce', 'full'], d.motion),
    customCss: typeof r.customCss === 'string' ? r.customCss : '',
    hideAvatars: r.hideAvatars === true,
    hideCounts: r.hideCounts === true,
    blockedUsers: Array.isArray(r.blockedUsers)
      ? r.blockedUsers
          .filter((u): u is { id: unknown; nickname?: unknown } => !!u && typeof u === 'object' && 'id' in u)
          .map((u) => ({ id: String(u.id), nickname: typeof u.nickname === 'string' ? u.nickname : String(u.id) }))
      : [],
    blockedKeywords: Array.isArray(r.blockedKeywords) ? r.blockedKeywords.filter((k): k is string => typeof k === 'string' && !!k.trim()) : [],
  };
}

export const WORK_VIEWS: { value: WorkView; label: string; icon: IconName }[] = [
  { value: 'small', label: '小图', icon: 'gridSmall' },
  { value: 'grid', label: '中图', icon: 'grid' },
  { value: 'large', label: '大图', icon: 'gridLarge' },
  { value: 'list', label: '列表', icon: 'rows' },
];

/* ---------- 全局状态 ---------- */

let current = normalize(boot.load());
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 写入 localStorage；存不下（隐私模式、空间满）时只在本次访问内生效 */
function persist() {
  try {
    localStorage.setItem(boot.KEY, JSON.stringify(current));
  } catch {
    // 忽略
  }
}

export function updateAppearance(patch: Partial<Appearance>) {
  current = { ...current, ...patch };
  persist();
  boot.apply(current);
  emit();
}

/** 恢复默认外观；屏蔽列表是内容偏好，不跟着清掉 */
export function resetAppearance() {
  try {
    localStorage.removeItem(boot.BG_KEY);
  } catch {
    // 忽略
  }
  updateAppearance({ ...DEFAULTS, blockedUsers: current.blockedUsers, blockedKeywords: current.blockedKeywords });
}

// 跟随系统时，系统切换深浅色要跟着变
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => current.theme === 'auto' && boot.apply(current));

// 在别的标签页改了设置，这里同步过来
window.addEventListener('storage', (e) => {
  if (e.key !== boot.KEY && e.key !== boot.BG_KEY) return;
  current = normalize(boot.load());
  boot.apply(current);
  emit();
});

export function useAppearance() {
  return useSyncExternalStore(subscribe, () => current);
}

/* ---------- 背景图 ---------- */

/** 把上传的图片缩到长边 1920px 以内再转成 JPEG，一般只有几百 KB，能放进 localStorage */
async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

/** 本地上传的背景图（data URL），没有就是 null */
export function storedBackground(): string | null {
  try {
    return localStorage.getItem(boot.BG_KEY);
  } catch {
    return null;
  }
}

export async function uploadBackground(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  const data = await compressImage(file);
  try {
    localStorage.setItem(boot.BG_KEY, data);
  } catch {
    throw new Error('图片太大，浏览器存不下，换一张小一点的试试');
  }
  updateAppearance({ background: { ...current.background, kind: 'upload' } });
}

export function clearBackground() {
  try {
    localStorage.removeItem(boot.BG_KEY);
  } catch {
    // 忽略
  }
  updateAppearance({ background: { ...current.background, kind: 'none', url: '' } });
}

/* ---------- 导出 / 导入 ---------- */

export function exportAppearance(): string {
  const backgroundData = current.background.kind === 'upload' ? storedBackground() : null;
  return JSON.stringify({ app: 'yesmiao', version: 1, settings: current, backgroundData }, null, 2);
}

export function importAppearance(json: string) {
  let data: { app?: unknown; settings?: unknown; backgroundData?: unknown };
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  if (data?.app !== 'yesmiao') throw new Error('这不是 YesMiao 导出的外观设置');
  const settings = normalize(data.settings);
  if (settings.background.kind === 'upload') {
    if (typeof data.backgroundData !== 'string' || !data.backgroundData.startsWith('data:image/')) {
      settings.background.kind = 'none';
    } else {
      try {
        localStorage.setItem(boot.BG_KEY, data.backgroundData);
      } catch {
        settings.background.kind = 'none';
      }
    }
  }
  updateAppearance(settings);
}

/* ---------- 屏蔽 ---------- */

export function blockUser(user: { id: string | number; nickname: string }) {
  const id = String(user.id);
  if (current.blockedUsers.some((u) => u.id === id)) return;
  updateAppearance({ blockedUsers: [...current.blockedUsers, { id, nickname: user.nickname }] });
}

export function unblockUser(id: string | number) {
  updateAppearance({ blockedUsers: current.blockedUsers.filter((u) => u.id !== String(id)) });
}

/** 判断某个用户或某段文字是否被屏蔽。HTML 正文先转成纯文本再匹配，避免匹配到标签里的内容 */
export function useBlocklist() {
  const { blockedUsers, blockedKeywords } = useAppearance();
  return useMemo(() => {
    const ids = new Set(blockedUsers.map((u) => u.id));
    const words = blockedKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
    const text = (s?: string) => !!s && words.length > 0 && words.some((w) => s.toLowerCase().includes(w));
    return {
      user: (id: string | number | undefined) => id !== undefined && ids.has(String(id)),
      text,
      html: (html?: string) => !!html && words.length > 0 && text(htmlToText(html, Infinity)),
    };
  }, [blockedUsers, blockedKeywords]);
}
