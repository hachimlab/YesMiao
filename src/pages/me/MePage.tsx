import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, forum, github, me, users, type Message, type MessageType, type MyDetails, type Post } from '../../api';
import { DiscussionListItem } from '../../components/cards';
import { Icon, type IconName } from '../../components/icons';
import { LoginForm } from '../../components/overlays';
import { Avatar, Button, ListState, Loading, useLoadMore } from '../../components/ui';
import { useAuthActions, useMe } from '../../lib/auth';
import { htmlToText, timeAgo } from '../../lib/format';
import { UserHeader, UserNav } from '../user/UserPage';

type Section = 'messages' | 'posts' | 'replied' | 'settings';

const SECTIONS: { value: Section; label: string; icon: IconName }[] = [
  { value: 'messages', label: '消息', icon: 'bell' },
  { value: 'posts', label: '我的讨论', icon: 'comment' },
  { value: 'replied', label: '我回复的', icon: 'reply' },
  { value: 'settings', label: '设置', icon: 'cog' },
];

const MESSAGE_TYPES: { value: MessageType; label: string }[] = [
  { value: 'COMMENT_REPLY', label: '评论与回复' },
  { value: 'LIKE_FORK', label: '赞与再创作' },
  { value: 'SYSTEM', label: '系统消息' },
];

interface MessageContent {
  sender?: { id: string | number; nickname: string; avatar_url?: string };
  message?: {
    business_id?: string | number;
    business_name?: string;
    comment?: string;
    reply?: string;
    replied?: string;
    content?: string;
    comment_content?: string;
    reason_name?: string;
  };
}

function businessLink(type: string, id?: string | number) {
  if (!id) return undefined;
  if (type.startsWith('POST')) return `/d/${id}`;
  if (type.startsWith('WORK') && !type.startsWith('WORK_SHOP') && !type.startsWith('WORK_SUBJECT')) return `/work/${id}`;
  return undefined;
}

/** 消息的 content 是一段 JSON 字符串，各类型字段不完全一样，这里尽量通用地展示 */
function NotificationItem({ m }: { m: Message }) {
  let c: MessageContent = {};
  try {
    c = JSON.parse(m.content);
  } catch {
    c = { message: { content: m.content } };
  }
  const msg = c.message || {};
  // 回帖、评论内容是 HTML（如 <p>…</p>），消息里只显示纯文本
  const text = htmlToText(msg.reply || msg.comment || msg.comment_content || msg.content || msg.reason_name || '', 300);
  const replied = msg.replied && htmlToText(msg.replied, 120);
  const link = businessLink(m.type, msg.business_id);
  return (
    <li className={`NotificationList-item${m.read_status === 'UNREAD' ? ' unread' : ''}`}>
      {c.sender ? (
        <Avatar src={c.sender.avatar_url} name={c.sender.nickname} size={32} />
      ) : (
        <span className="NotificationList-system">
          <Icon name="bell" />
        </span>
      )}
      <div>
        <div>
          {c.sender && <Link to={`/u/${c.sender.id}`} className="username">{c.sender.nickname}</Link>}
          {msg.business_name && (
            <>
              {c.sender ? ' 在 ' : ''}
              {link ? <Link to={link}>{msg.business_name}</Link> : <span>{msg.business_name}</span>}
            </>
          )}
        </div>
        {text && <p>{text}</p>}
        {replied && <p>“{replied}”</p>}
        <time>{timeAgo(m.created_at)}</time>
      </div>
    </li>
  );
}

function Messages() {
  const qc = useQueryClient();
  const [type, setType] = useState<MessageType>('COMMENT_REPLY');
  const counts = useQuery({ queryKey: ['message-count'], queryFn: me.messageCount });
  const list = useLoadMore<Message>(['messages', type], async (page) => {
    const d = await me.messages(type, page);
    // 官方打开列表即标记已读，刷新顶栏角标
    qc.invalidateQueries({ queryKey: ['message-count'] });
    return d;
  });
  const countOf = (t: MessageType) => counts.data?.find((x) => x.query_type === t)?.count || 0;

  return (
    <>
      <div className="IndexPage-toolbar">
        <div className="ButtonGroup">
          {MESSAGE_TYPES.map((t) => (
            <Button key={t.value} className={type === t.value ? 'active' : ''} onClick={() => setType(t.value)}>
              {t.label}
              {countOf(t.value) > 0 ? ` (${countOf(t.value)})` : ''}
            </Button>
          ))}
        </div>
      </div>
      <ul>
        <ListState list={list} empty="暂无消息">
          {(items) => items.map((m) => <NotificationItem key={m.id} m={m} />)}
        </ListState>
      </ul>
    </>
  );
}

function MyDiscussions({ kind }: { kind: 'posts' | 'replied' }) {
  const list = useLoadMore<Post>(['my-posts', kind], (page) => (kind === 'posts' ? forum.myPosts(page) : forum.myReplied(page)));
  return (
    <ul className="DiscussionList">
      <ListState list={list} empty="还没有讨论">
        {(items) => items.map((p) => <DiscussionListItem key={p.id} post={p} />)}
      </ListState>
    </ul>
  );
}

// 授权回调跳回设置页时带的 ?github=，见 functions/api 的 githubCallback
const GITHUB_RESULTS: Record<string, string> = {
  bound: '已绑定',
  denied: '已取消授权',
  expired: '授权已过期，请重新绑定',
  login: '登录已失效，请重新登录后再绑定',
  error: '绑定失败，请稍后再试',
};

/** 编程猫没有第三方账号绑定，绑定关系存在本站，只用来在主页上显示 GitHub */
function GithubSettings() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(() => GITHUB_RESULTS[params.get('github') || ''] || '');
  const mine = useQuery({ queryKey: ['github-me'], queryFn: github.mine });
  const binding = mine.data?.binding;

  // 提示读出来之后把参数去掉，刷新页面不再重复显示
  useEffect(() => {
    if (params.has('github')) setParams((p) => (p.delete('github'), p), { replace: true });
  }, [params, setParams]);

  async function run(action: () => Promise<void>, done: string) {
    setStatus('保存中…');
    try {
      await action();
      await qc.invalidateQueries({ queryKey: ['github-me'] });
      await qc.invalidateQueries({ queryKey: ['github'] });
      setStatus(done);
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : '保存失败');
    }
  }

  if (!mine.data?.configured) return null;
  return (
    <div className="Form-group" style={{ marginTop: 24 }}>
      <label>GitHub</label>
      {binding ? (
        <>
          <div>
            <a href={`https://github.com/${binding.login}`} target="_blank" rel="noopener noreferrer">
              <Icon name="github" /> {binding.login}
            </a>
          </div>
          {/* 包一层 div：.Form-group > label 会把开关也变成粗体的块级标题 */}
          <div style={{ margin: '10px 0' }}>
            <label className="Switch">
              <input
                type="checkbox"
                role="switch"
                checked={binding.show}
                onChange={(e) => {
                  const show = e.target.checked;
                  run(() => github.setVisible(show), show ? '已在主页显示' : '已从主页隐藏');
                }}
              />
              在我的主页显示
            </label>
          </div>
          <div>
            <a className="Button" href={github.startUrl}>
              <span className="Button-label">重新绑定</span>
            </a>{' '}
            <Button type="button" onClick={() => run(github.unbind, '已解绑')}>
              解绑
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ margin: '0 0 10px' }}>
            绑定后可以选择在主页显示 GitHub 账号。只读取公开的用户名，不申请任何权限。
          </p>
          <a className="Button" href={github.startUrl}>
            <Icon name="github" />
            <span className="Button-label">绑定 GitHub</span>
          </a>
        </>
      )}
      {status && <div className="muted" style={{ marginTop: 8 }}>{status}</div>}
    </div>
  );
}

function Settings({ user }: { user: MyDetails }) {
  const qc = useQueryClient();
  const [nickname, setNickname] = useState(user.nickname);
  const [description, setDescription] = useState(user.description || '');
  const [status, setStatus] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus('保存中…');
    try {
      await me.updateInfo({ nickname: nickname.trim(), description });
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.invalidateQueries({ queryKey: ['honor', String(user.id)] });
      setStatus('已保存');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : '保存失败');
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <form onSubmit={save}>
        <div className="Form-group">
          <label>昵称</label>
          <input className="FormControl" value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} />
        </div>
        <div className="Form-group">
          <label>个人简介</label>
          <textarea className="FormControl" rows={4} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="Form-group">
          <label>账号</label>
          <div className="muted">
            用户 ID：{user.id}
            {user.username && <> · 用户名：{user.username}</>}
            <br />
            手机号：{user.phone_number || '未绑定（未绑定手机号无法发帖）'}
          </div>
        </div>
        <Button variant="primary" type="submit">
          保存修改
        </Button>
        {status && <span className="muted" style={{ marginLeft: 12 }}>{status}</span>}
      </form>
      <GithubSettings />
      <p className="muted" style={{ marginTop: 24 }}>
        主题色、字号、背景图、屏蔽等外观选项在 <Link to="/settings">外观设置</Link> 里，不需要登录。
      </p>
    </div>
  );
}

export default function MePage() {
  const { user, loading } = useMe();
  const { logout } = useAuthActions();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams();
  const section = (SECTIONS.find((s) => s.value === sectionParam)?.value ?? 'messages') as Section;
  const honor = useQuery({ queryKey: ['honor', String(user?.id)], queryFn: () => users.honor(String(user!.id)), enabled: !!user });

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="UserPage container">
      {honor.data ? (
        <UserHeader
          honor={honor.data}
          actions={
            <Button
              icon="logout"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              退出登录
            </Button>
          }
        />
      ) : (
        <div className="UserHeader" style={{ height: 200 }} />
      )}
      <UserNav>
        {SECTIONS.map((s) => (
          <NavLink key={s.value} to={s.value === 'messages' ? '/me' : `/me/${s.value}`} end>
            <Icon name={s.icon} />
            {s.label}
          </NavLink>
        ))}
        <Link to={`/u/${user.id}`}>
          <Icon name="user" />
          我的主页
        </Link>
      </UserNav>
      <div className="UserPage-content">
        {section === 'messages' && <Messages />}
        {section === 'posts' && <MyDiscussions kind="posts" />}
        {section === 'replied' && <MyDiscussions kind="replied" />}
        {section === 'settings' && <Settings user={user} />}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user } = useMe();
  const navigate = useNavigate();
  if (user) return <Navigate to="/me" replace />;
  return (
    <div className="container">
      <div className="LoginPage">
        <div className="Modal-header">
          <h3>登录</h3>
        </div>
        <LoginForm onDone={() => navigate('/')} />
      </div>
    </div>
  );
}
