import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, NavLink, useNavigate, useParams } from 'react-router-dom';
import { ApiError, forum, me, users, type Message, type MessageType, type MyDetails, type Post } from '../../api';
import { DiscussionListItem } from '../../components/cards';
import { Icon, type IconName } from '../../components/icons';
import { LoginForm } from '../../components/overlays';
import { Avatar, Button, ListState, Loading, useLoadMore } from '../../components/ui';
import { useAuthActions, useMe } from '../../lib/auth';
import { timeAgo } from '../../lib/format';
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
  const text = msg.reply || msg.comment || msg.comment_content || msg.content || msg.reason_name || '';
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
        {msg.replied && <p>“{msg.replied}”</p>}
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
    <form onSubmit={save} style={{ maxWidth: 480 }}>
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
      <p className="muted" style={{ marginTop: 24 }}>
        主题色、字号、背景图、屏蔽等外观选项在 <Link to="/settings">外观设置</Link> 里，不需要登录。
      </p>
    </form>
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
