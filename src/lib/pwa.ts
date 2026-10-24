import { useSyncExternalStore } from 'react';

/**
 * PWA：注册 Service Worker（src/sw.js），并把“有新版本”“可以安装”“离线”这几个状态提供给界面。
 * 开发环境不注册，免得缓存挡住热更新
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** 新版本已下载好，等用户点刷新 */
  waiting: ServiceWorker | null;
  /** 浏览器给了安装提示（Chromium 系）；iOS 没有，只能从分享菜单“添加到主屏幕” */
  installPrompt: BeforeInstallPromptEvent | null;
  online: boolean;
}

let state: PwaState = { waiting: null, installPrompt: null, online: navigator.onLine };
const listeners = new Set<() => void>();

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePwa() {
  return useSyncExternalStore(subscribe, () => state);
}

/** 是否以安装后的独立窗口打开（没有浏览器的地址栏和返回键） */
export const standalone =
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

addEventListener('online', () => set({ online: true }));
addEventListener('offline', () => set({ online: false }));
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  set({ installPrompt: e as BeforeInstallPromptEvent });
});
addEventListener('appinstalled', () => set({ installPrompt: null }));

export async function install() {
  const prompt = state.installPrompt;
  if (!prompt) return;
  await prompt.prompt();
  // 提示只能用一次，不管装没装都清掉
  set({ installPrompt: null });
}

let reloading = false;

export function applyUpdate() {
  if (!state.waiting) return;
  // 别的标签页已经点过刷新、新版本已接管时，这里直接刷新就行
  if (state.waiting.state === 'activated') return location.reload();
  reloading = true;
  state.waiting.postMessage('SKIP_WAITING');
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // 新的 Service Worker 接管后刷新一次，加载新版本的代码；首次安装接管时不刷新
  navigator.serviceWorker.addEventListener('controllerchange', () => reloading && location.reload());

  addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('/sw.js').catch(() => null);
    if (!reg) return;
    const track = (sw: ServiceWorker | null) => {
      if (!sw) return;
      const check = () => sw.state === 'installed' && navigator.serviceWorker.controller && set({ waiting: sw });
      check();
      sw.addEventListener('statechange', check);
    };
    track(reg.waiting);
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    // 装成应用后往往一直挂在后台不重新打开，切回前台时检查一下有没有发新版
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
  });
}
