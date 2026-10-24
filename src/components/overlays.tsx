import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, type Board } from '../api';
import { useAuthActions, useMe } from '../lib/auth';
import { useQuotaTip, type PublishRule } from '../lib/limits';
import { Icon } from './icons';
import { Avatar, Button } from './ui';

/* Flarum 的两个全局浮层：底部停靠的编辑器（Composer）和登录弹窗 */

export interface ComposerSpec {
  heading: ReactNode;
  placeholder: string;
  submitLabel: string;
  /** 发起讨论时需要标题和板块 */
  discussion?: { boards: Board[]; boardId: string };
  /** 官方的字数和次数限制，见 lib/limits */
  rule?: PublishRule;
  onSubmit: (data: { text: string; title: string; boardId: string }) => Promise<void>;
}

interface OverlayApi {
  openComposer: (spec: ComposerSpec) => void;
  openLogin: () => void;
}

const OverlayContext = createContext<OverlayApi>({ openComposer: () => {}, openLogin: () => {} });

export const useOverlays = () => useContext(OverlayContext);

function Composer({ spec, onClose }: { spec: ComposerSpec; onClose: () => void }) {
  const { user } = useMe();
  const [minimized, setMinimized] = useState(false);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [boardId, setBoardId] = useState(spec.discussion?.boardId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const quota = useQuotaTip(spec.rule?.quota);
  const max = spec.rule?.maxLength;
  const ready = text.trim() && (!spec.discussion || title.trim());

  async function submit() {
    if (!ready || busy) return;
    const invalid = spec.rule?.check(text.trim(), title.trim());
    if (invalid) return setError(invalid);
    setBusy(true);
    setError('');
    try {
      await spec.onSubmit({ text: text.trim(), title: title.trim(), boardId });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '发送失败，请稍后再试');
      setBusy(false);
    }
  }

  function close() {
    if (text.trim() && !confirm('关闭后已输入的内容会丢失，确定吗？')) return;
    onClose();
  }

  return (
    <div className={`Composer${minimized ? ' Composer--minimized' : ''}`} role="dialog" aria-label="编辑器">
      <div className="Composer-handle" onClick={() => minimized && setMinimized(false)}>
        <div className="container Composer-header">
          {user && <Avatar src={user.avatar_url} name={user.nickname} size={24} />}
          <span className="Composer-heading">{spec.heading}</span>
          <span className="Composer-controls">
            <Button variant="text" icon={minimized ? 'arrowUp' : 'minus'} title={minimized ? '展开' : '最小化'} onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }} />
            <Button variant="text" icon="close" title="关闭" onClick={(e) => { e.stopPropagation(); close(); }} />
          </span>
        </div>
      </div>
      {!minimized && (
        <div className="container Composer-body">
          {spec.discussion && (
            <div className="Composer-titleRow">
              <select value={boardId} onChange={(e) => setBoardId(e.target.value)} className="FormControl Composer-board" aria-label="板块">
                {spec.discussion.boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input className="Composer-title" placeholder="讨论标题（5-50 字）" value={title} maxLength={50} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
          )}
          <textarea
            className="Composer-text"
            placeholder={spec.placeholder}
            value={text}
            maxLength={max}
            autoFocus={!spec.discussion}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
          <div className="Composer-footer">
            <Button variant="primary" onClick={submit} disabled={!ready || busy}>
              {busy ? '发送中…' : spec.submitLabel}
            </Button>
            {error ? <span className="Composer-error">{error}</span> : <span className="Composer-hint">Ctrl / ⌘ + Enter 发送</span>}
            <span className="Composer-limit">
              {quota}
              {max && <span className={text.length >= max ? 'full' : ''}>{text.length}/{max}</span>}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function LoginForm({ onDone }: { onDone?: () => void }) {
  const { login } = useAuthActions();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(identity.trim(), password);
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请稍后再试');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="Alert Alert--error">{error}</div>}
      <div className="Modal-body">
        <div className="Form Form--centered">
          <input className="FormControl" placeholder="手机号 / 用户名 / 邮箱" autoComplete="username" value={identity} onChange={(e) => setIdentity(e.target.value)} required autoFocus />
          <input className="FormControl" type="password" placeholder="密码" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button variant="primary" block type="submit" disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </Button>
        </div>
      </div>
      <div className="Modal-footer">
        <p>使用编程猫账号登录。密码直接提交给编程猫官方，本站不保存密码。</p>
        <p>注册账号或找回密码，请使用编程猫官方 App。</p>
      </div>
    </form>
  );
}

function LoginModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="ModalManager" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="Modal Modal--small" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <div className="Modal-close">
          <Button variant="text" icon="close" title="关闭" onClick={onClose} />
        </div>
        <div className="Modal-header">
          <h3 id="login-title">登录</h3>
        </div>
        <LoginForm onDone={onClose} />
      </div>
    </div>
  );
}

export function OverlayProvider({ children }: { children: ReactNode }) {
  const { user } = useMe();
  const [composer, setComposer] = useState<ComposerSpec | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [login, setLogin] = useState(false);

  const api: OverlayApi = {
    openComposer: (spec) => {
      if (!user) {
        setLogin(true);
        return;
      }
      setComposer(spec);
      setComposerKey((k) => k + 1);
    },
    openLogin: () => setLogin(true),
  };

  return (
    <OverlayContext.Provider value={api}>
      {children}
      {composer && user && <Composer key={composerKey} spec={composer} onClose={() => setComposer(null)} />}
      {login && <LoginModal onClose={() => setLogin(false)} />}
    </OverlayContext.Provider>
  );
}

export function GuestHint({ children }: { children: ReactNode }) {
  const { openLogin } = useOverlays();
  return (
    <button className="Button Button--link" onClick={openLogin}>
      <Icon name="user" />
      <span className="Button-label">{children}</span>
    </button>
  );
}
