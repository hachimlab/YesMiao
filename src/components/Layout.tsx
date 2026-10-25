import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { me } from '../api';
import { useAuthActions, useMe } from '../lib/auth';
import { safeMode, updateAppearance, useAppearance, type ThemeMode } from '../lib/appearance';
import { applyUpdate, install, standalone, usePwa } from '../lib/pwa';
import { Icon, type IconName } from './icons';
import FirstVisitNotice from './FirstVisitNotice';
import { OverlayProvider, useOverlays } from './overlays';
import { Avatar } from './ui';
import { searchUrl, type SearchType } from '../pages/forum/SearchPage';

/** 下拉菜单打开时，点菜单外面就关掉 */
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, setOpen: (v: boolean) => void) {
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ref, open, setOpen]);
}

const THEMES: { value: ThemeMode; label: string; icon: IconName }[] = [
  { value: 'light', label: '浅色', icon: 'sun' },
  { value: 'dark', label: '深色', icon: 'moon' },
  { value: 'auto', label: '跟随系统', icon: 'monitor' },
];

const GITHUB_URL = 'https://github.com/hachimlab/yesmiao';

/** 深浅色、外观设置和安装：宽屏的外观下拉和手机的汉堡菜单共用 */
function ThemeMenuItems() {
  const { theme } = useAppearance();
  const { installPrompt } = usePwa();
  return (
    <>
      {THEMES.map((t) => (
        <li key={t.value}>
          <button onClick={() => updateAppearance({ theme: t.value })} aria-pressed={theme === t.value}>
            <Icon name={t.icon} /> {t.label}
            {theme === t.value && <Icon name="check" className="Dropdown-check" />}
          </button>
        </li>
      ))}
      <li className="Dropdown-separator" />
      <li>
        <Link to="/settings">
          <Icon name="brush" /> 更多外观设置
        </Link>
      </li>
      {installPrompt && (
        <li>
          <button onClick={install}>
            <Icon name="download" /> 安装到桌面
          </button>
        </li>
      )}
    </>
  );
}

function ThemeDropdown() {
  const { theme } = useAppearance();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, setOpen);
  const current = THEMES.find((t) => t.value === theme)!;
  return (
    <div className={`Dropdown Header-theme${open ? ' open' : ''}`} ref={ref}>
      <button
        className="Button Button--flat Button--icon"
        onClick={() => setOpen(!open)}
        title={`外观：${current.label}`}
        aria-label="外观"
        aria-expanded={open}
      >
        <Icon name={current.icon} size={16} />
      </button>
      {open && (
        <ul className="Dropdown-menu Dropdown-menu--right" onClick={() => setOpen(false)}>
          <ThemeMenuItems />
        </ul>
      )}
    </div>
  );
}

/** 手机顶栏只放得下搜索、铃铛和头像，板块切换、外观和 GitHub 都收进这里（宽屏不显示） */
function MobileMenu({ onWorks }: { onWorks: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, setOpen);
  return (
    <div className={`Dropdown Header-menu${open ? ' open' : ''}`} ref={ref}>
      <button className="Button Button--flat Button--icon" onClick={() => setOpen(!open)} aria-label="菜单" aria-expanded={open}>
        <Icon name="menu" size={20} />
      </button>
      {open && (
        <ul className="Dropdown-menu" onClick={() => setOpen(false)}>
          <li>
            <Link to="/" aria-current={onWorks ? undefined : 'page'}>
              <Icon name="comment" /> 论坛
              {!onWorks && <Icon name="check" className="Dropdown-check" />}
            </Link>
          </li>
          <li>
            <Link to="/works" aria-current={onWorks ? 'page' : undefined}>
              <Icon name="grid" /> 作品
              {onWorks && <Icon name="check" className="Dropdown-check" />}
            </Link>
          </li>
          <li className="Dropdown-separator" />
          <ThemeMenuItems />
          <li className="Dropdown-separator" />
          <li>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Icon name="github" /> GitHub 仓库
            </a>
          </li>
        </ul>
      )}
    </div>
  );
}

function NotificationsButton() {
  const { data } = useQuery({ queryKey: ['message-count'], queryFn: me.messageCount, refetchInterval: 120_000 });
  const total = (data || []).reduce((s, x) => s + (x.count || 0), 0);
  return (
    <Link to="/me" className="Button Button--flat Header-notifications" title="消息">
      <Icon name="bell" size={16} />
      {total > 0 && <span className="NotificationsDropdown-unread">{total > 99 ? '99+' : total}</span>}
    </Link>
  );
}

function SessionDropdown() {
  const { user } = useMe();
  const { logout } = useAuthActions();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, setOpen);

  if (!user) return null;
  return (
    <div className={`Dropdown${open ? ' open' : ''}`} ref={ref}>
      <button className="Button Button--flat SessionDropdown" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Avatar src={user.avatar_url} name={user.nickname} size={24} />
        <span className="Button-label">{user.nickname}</span>
      </button>
      {open && (
        <ul className="Dropdown-menu Dropdown-menu--right" onClick={() => setOpen(false)}>
          <li>
            <Link to={`/u/${user.id}`}>
              <Icon name="user" /> 个人主页
            </Link>
          </li>
          <li>
            <Link to="/me">
              <Icon name="bell" /> 消息
            </Link>
          </li>
          <li>
            <Link to="/me/settings">
              <Icon name="cog" /> 账号设置
            </Link>
          </li>
          <li>
            <Link to="/settings">
              <Icon name="brush" /> 外观设置
            </Link>
          </li>
          <li className="Dropdown-separator" />
          <li>
            <button
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              <Icon name="logout" /> 退出登录
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function Header() {
  const { user } = useMe();
  const { openLogin } = useOverlays();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const searchType = location.pathname === '/search' ? (new URLSearchParams(location.search).get('type') as SearchType | null) : null;
  const onWorks = location.pathname.startsWith('/work') || searchType === 'works';

  function search(e: FormEvent) {
    e.preventDefault();
    // 在搜索页里沿用当前分类；在作品区默认搜作品
    if (q.trim()) navigate(searchUrl(q.trim(), searchType ?? (onWorks ? 'works' : undefined)));
  }

  return (
    <header className="App-header">
      <div className="container Header-container">
        {/* 装成应用后没有浏览器的返回键（iOS 也没有返回手势），在顶栏补一个；key 为 default 说明是打开应用的第一页 */}
        {standalone && location.key !== 'default' && (
          <button className="Button Button--flat Button--icon Header-back" onClick={() => navigate(-1)} aria-label="返回">
            <Icon name="back" size={20} />
          </button>
        )}
        <MobileMenu onWorks={onWorks} />
        <h1 className="Header-title">
          <Link to="/">
            <img className="Header-logo" src="/logo.png" alt="" width={30} height={30} />
            YesMiao
          </Link>
        </h1>
        <nav className="Header-switch" aria-label="切换板块">
          <NavLink to="/" className={() => (onWorks ? '' : 'active')}>
            论坛
          </NavLink>
          <NavLink to="/works" className={() => (onWorks ? 'active' : '')}>
            作品
          </NavLink>
        </nav>
        <div className="Header-secondary">
          <form className="Search" onSubmit={search} role="search">
            <Icon name="search" />
            <input className="Search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索讨论、作品、用户" aria-label="搜索" />
          </form>
          <a
            className="Button Button--flat Button--icon Header-github"
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub 仓库"
            aria-label="GitHub 仓库"
          >
            <Icon name="github" size={16} />
          </a>
          <ThemeDropdown />
          {user ? (
            <>
              <NotificationsButton />
              <SessionDropdown />
            </>
          ) : (
            <button className="Button Button--link" onClick={openLogin}>
              登录
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default function Layout() {
  const location = useLocation();
  const { waiting, online } = usePwa();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <OverlayProvider>
      <div className="App">
        <Header />
        {waiting && (
          <div className="Alert AppBanner">
            YesMiao 有新版本了。
            <button className="Button Button--link" onClick={applyUpdate}>
              刷新
            </button>
          </div>
        )}
        {!online && <div className="Alert AppBanner">当前没有网络，显示的是之前看过的内容。</div>}
        {safeMode && (
          <div className="Alert AppBanner">
            安全模式：本次访问没有加载自定义 CSS 和背景图。<Link to="/settings#custom">去外观设置修改</Link>
          </div>
        )}
        <main className="App-content">
          <Outlet />
        </main>
        <footer className="App-footer">
          <div className="container">
            <p>YesMiao 是社区用户维护的编程猫社区第三方前端，与编程猫官方无关。</p>
            <a className="App-footer-link" href="https://github.com/hachimlab/yesmiao" target="_blank" rel="noopener noreferrer">
              <Icon name="github" size={14} />
              在 GitHub 上查看源码
            </a>
          </div>
        </footer>
      </div>
      <FirstVisitNotice />
    </OverlayProvider>
  );
}
