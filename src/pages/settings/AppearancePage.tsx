import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../../components/icons';
import { Avatar, Button, PostAction, SideNav } from '../../components/ui';
import {
  clearBackground,
  DEFAULT_ACCENT,
  exportAppearance,
  importAppearance,
  resetAppearance,
  safeMode,
  storedBackground,
  unblockUser,
  updateAppearance,
  uploadBackground,
  useAppearance,
  WORK_VIEWS,
  type Appearance,
} from '../../lib/appearance';

const SECTIONS = [
  { id: 'theme', label: '主题', icon: 'sun' },
  { id: 'reading', label: '阅读', icon: 'comment' },
  { id: 'works', label: '作品', icon: 'grid' },
  { id: 'background', label: '背景与动效', icon: 'brush' },
  { id: 'content', label: '内容过滤', icon: 'eye' },
  { id: 'custom', label: '自定义 CSS', icon: 'edit' },
  { id: 'data', label: '导入导出', icon: 'download' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

const ACCENTS: { value: string | null; label: string; color: string }[] = [
  { value: null, label: '默认黄', color: DEFAULT_ACCENT },
  { value: '#4d698e', label: '灰蓝', color: '#4d698e' },
  { value: '#2b7de9', label: '天蓝', color: '#2b7de9' },
  { value: '#14a3a3', label: '青绿', color: '#14a3a3' },
  { value: '#2f9e6e', label: '薄荷绿', color: '#2f9e6e' },
  { value: '#f5a623', label: '编程猫橙', color: '#f5a623' },
  { value: '#e0598b', label: '樱花粉', color: '#e0598b' },
  { value: '#7b5cd6', label: '葡萄紫', color: '#7b5cd6' },
  { value: '#d64545', label: '番茄红', color: '#d64545' },
];

interface Option<T> {
  value: T;
  label: string;
  icon?: IconName;
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  return (
    <div className="ButtonGroup">
      {options.map((o) => (
        <Button key={o.value} icon={o.icon} className={value === o.value ? 'active' : ''} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="Switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function Range({
  value,
  min,
  max,
  step,
  format,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="Range">
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{format(value)}</output>
    </div>
  );
}

function Row({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="Settings-row">
      <span className="Settings-label">{label}</span>
      <div className="Settings-inline">{children}</div>
      {help && <p className="helpText">{help}</p>}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="Settings-section" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/* ---------- 主题 ---------- */

function ThemeSection({ s }: { s: Appearance }) {
  const custom = s.accent !== null && !ACCENTS.some((a) => a.value === s.accent);
  return (
    <Section id="theme" title="主题">
      <Row label="深浅色">
        <Segmented
          value={s.theme}
          onChange={(theme) => updateAppearance({ theme })}
          options={[
            { value: 'light', label: '浅色', icon: 'sun' },
            { value: 'dark', label: '深色', icon: 'moon' },
            { value: 'auto', label: '跟随系统', icon: 'monitor' },
          ]}
        />
      </Row>
      <Row label="主题色" help="按钮、链接、选中状态都会换成这个颜色，深色模式下自动调亮">
        <div className="Swatches">
          {ACCENTS.map((a) => (
            <button
              key={a.label}
              className={`Swatch${s.accent === a.value ? ' active' : ''}`}
              style={{ background: a.color }}
              title={a.label}
              aria-label={a.label}
              aria-pressed={s.accent === a.value}
              onClick={() => updateAppearance({ accent: a.value })}
            />
          ))}
          <label className={`Swatch Swatch--custom${custom ? ' active' : ''}`} title="自定义颜色" style={custom ? { background: s.accent! } : undefined}>
            <input type="color" value={s.accent ?? DEFAULT_ACCENT} aria-label="自定义颜色" onChange={(e) => updateAppearance({ accent: e.target.value })} />
          </label>
        </div>
      </Row>
    </Section>
  );
}

/* ---------- 阅读 ---------- */

function Preview() {
  return (
    <div className="AppearancePreview" aria-label="预览">
      <header className="Post-header">
        <Avatar name="喵" size={24} />
        <span className="PostUser-name">预览用户</span>
        <time className="Post-time">刚刚</time>
      </header>
      <div className="Post-body">
        <p>这是一段预览正文，调整下面的选项时，整个站点会立刻跟着变化。</p>
        <p>
          长帖读起来累的话，可以试试大一点的字号和更宽松的行距。<a>这是一个链接</a>。
        </p>
      </div>
      <div className="AppearancePreview-actions">
        <Button variant="primary" icon="reply">
          回复
        </Button>
        <Button>普通按钮</Button>
        <PostAction icon="heart" label="赞" count={12} />
      </div>
    </div>
  );
}

function ReadingSection({ s }: { s: Appearance }) {
  return (
    <Section id="reading" title="阅读">
      <Preview />
      <Row label="正文字号">
        <Segmented
          value={s.fontSize}
          onChange={(fontSize) => updateAppearance({ fontSize })}
          options={[
            { value: 'sm', label: '小' },
            { value: 'md', label: '默认' },
            { value: 'lg', label: '大' },
            { value: 'xl', label: '特大' },
          ]}
        />
      </Row>
      <Row label="行距">
        <Range
          label="行距"
          value={s.lineHeight ?? 1.8}
          min={1.4}
          max={2.2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(lineHeight) => updateAppearance({ lineHeight })}
        />
        {s.lineHeight !== null && <Button onClick={() => updateAppearance({ lineHeight: null })}>恢复默认</Button>}
      </Row>
      <Row label="正文字体">
        <Switch checked={s.serif} onChange={(serif) => updateAppearance({ serif })}>
          使用衬线字体（宋体）
        </Switch>
      </Row>
      <Row label="显示密度" help="紧凑适合快速刷帖，宽松适合慢慢读">
        <Segmented
          value={s.density}
          onChange={(density) => updateAppearance({ density })}
          options={[
            { value: 'compact', label: '紧凑' },
            { value: 'normal', label: '默认' },
            { value: 'comfy', label: '宽松' },
          ]}
        />
      </Row>
      <Row label="圆角">
        <Segmented
          value={s.radius}
          onChange={(radius) => updateAppearance({ radius })}
          options={[
            { value: 'square', label: '直角' },
            { value: 'normal', label: '默认' },
            { value: 'round', label: '大圆角' },
          ]}
        />
      </Row>
    </Section>
  );
}

/* ---------- 作品 ---------- */

function WorksSection({ s }: { s: Appearance }) {
  return (
    <Section id="works" title="作品">
      <Row label="作品布局" help="作品发现页、个人主页和搜索结果都按这个布局显示，作品页工具栏里也能切换">
        <Segmented value={s.workView} onChange={(workView) => updateAppearance({ workView })} options={WORK_VIEWS} />
      </Row>
    </Section>
  );
}

/* ---------- 背景与动效 ---------- */

function BackgroundSection({ s }: { s: Appearance }) {
  const bg = s.background;
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = bg.kind === 'upload' ? storedBackground() : bg.kind === 'url' ? bg.url : null;

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError('');
    setBusy(true);
    try {
      await uploadBackground(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片读取失败');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  }

  return (
    <Section id="background" title="背景与动效">
      {safeMode && <p className="Settings-note">当前是安全模式，背景图不会显示。去掉网址里的 ?nostyle 刷新即可恢复。</p>}
      <Row label="背景图">
        <Segmented
          value={bg.kind}
          onChange={(kind) => {
            setError('');
            if (kind === 'none') clearBackground();
            else if (kind === 'upload' && !storedBackground()) file.current?.click();
            else updateAppearance({ background: { ...bg, kind } });
          }}
          options={[
            { value: 'none', label: '无' },
            { value: 'upload', label: '本地图片', icon: 'upload' },
            { value: 'url', label: '图片链接', icon: 'link' },
          ]}
        />
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </Row>
      {bg.kind === 'url' && (
        <Row label="图片地址" help="填 https:// 开头的图片地址；图片站如果禁止外链，可能显示不出来">
          <input
            className="FormControl"
            placeholder="https://example.com/wallpaper.jpg"
            value={bg.url}
            onChange={(e) => updateAppearance({ background: { ...bg, url: e.target.value.trim() } })}
          />
        </Row>
      )}
      {bg.kind === 'upload' && (
        <Row label="当前图片" help="图片会缩小压缩后存在本机浏览器里，不会上传到任何服务器">
          <div className="BgPreview" style={preview ? { backgroundImage: `url("${preview}")` } : undefined} />
          <Button icon="upload" onClick={() => file.current?.click()} disabled={busy}>
            {busy ? '处理中…' : '更换图片'}
          </Button>
        </Row>
      )}
      {error && <p className="Settings-note" style={{ color: 'var(--error-color)' }}>{error}</p>}
      {bg.kind !== 'none' && (
        <>
          <Row label="模糊">
            <Range label="背景模糊" value={bg.blur} min={0} max={30} step={1} format={(v) => `${v}px`} onChange={(blur) => updateAppearance({ background: { ...bg, blur } })} />
          </Row>
          <Row label="遮罩" help="盖在图片上的底色有多不透明。调低图片更明显，但文字会更难看清">
            <Range
              label="遮罩不透明度"
              value={bg.dim}
              min={0.3}
              max={0.97}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(dim) => updateAppearance({ background: { ...bg, dim } })}
            />
          </Row>
        </>
      )}
      <Row label="顶栏">
        <Switch checked={s.glass} onChange={(glass) => updateAppearance({ glass })}>
          毛玻璃效果（半透明，透出下面滚过的内容）
        </Switch>
      </Row>
      <Row label="动画">
        <Segmented
          value={s.motion}
          onChange={(motion) => updateAppearance({ motion })}
          options={[
            { value: 'auto', label: '跟随系统' },
            { value: 'reduce', label: '减少动画' },
            { value: 'full', label: '完整动画' },
          ]}
        />
      </Row>
    </Section>
  );
}

/* ---------- 内容过滤 ---------- */

function KeywordInput({ keywords }: { keywords: string[] }) {
  const [text, setText] = useState('');
  function add(e: FormEvent) {
    e.preventDefault();
    // 支持一次输入多个，用逗号或空格隔开
    const words = text
      .split(/[,，\s]+/)
      .map((w) => w.trim())
      .filter((w) => w && !keywords.includes(w));
    if (words.length) updateAppearance({ blockedKeywords: [...keywords, ...words] });
    setText('');
  }
  return (
    <form onSubmit={add} className="Settings-inline">
      <input className="FormControl" style={{ flex: 1, minWidth: 160 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="输入关键词，多个用逗号隔开" />
      <Button type="submit" disabled={!text.trim()}>
        添加
      </Button>
    </form>
  );
}

function ContentSection({ s }: { s: Appearance }) {
  return (
    <Section id="content" title="内容过滤">
      <Row label="头像">
        <Switch checked={s.hideAvatars} onChange={(hideAvatars) => updateAppearance({ hideAvatars })}>
          隐藏列表、帖子和评论里的头像
        </Switch>
      </Row>
      <Row label="计数">
        <Switch checked={s.hideCounts} onChange={(hideCounts) => updateAppearance({ hideCounts })}>
          隐藏点赞数和浏览数
        </Switch>
      </Row>
      <Row label="屏蔽用户" help="在用户主页点“屏蔽”添加。屏蔽后列表里不再显示他的帖子和作品，回帖和评论会折叠">
        {s.blockedUsers.length ? (
          <div className="ChipList" style={{ marginTop: 0 }}>
            {s.blockedUsers.map((u) => (
              <span className="Chip" key={u.id}>
                <Link to={`/u/${u.id}`}>{u.nickname}</Link>
                <button onClick={() => unblockUser(u.id)} title="取消屏蔽" aria-label={`取消屏蔽 ${u.nickname}`}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className="muted">还没有屏蔽任何人</span>
        )}
      </Row>
      <Row label="屏蔽词" help="标题、作品名、回帖或评论里包含这些词的内容会被隐藏，不区分大小写">
        <KeywordInput keywords={s.blockedKeywords} />
        {!!s.blockedKeywords.length && (
          <div className="ChipList" style={{ width: '100%' }}>
            {s.blockedKeywords.map((k) => (
              <span className="Chip" key={k}>
                {k}
                <button onClick={() => updateAppearance({ blockedKeywords: s.blockedKeywords.filter((x) => x !== k) })} title="删除" aria-label={`删除 ${k}`}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </Row>
    </Section>
  );
}

/* ---------- 自定义 CSS ---------- */

function CustomCssSection({ s }: { s: Appearance }) {
  const safeUrl = `${location.origin}/settings?nostyle`;

  /** Tab 键插入两个空格，而不是跳到下一个控件 */
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = el.value.slice(0, start) + '  ' + el.value.slice(end);
    updateAppearance({ customCss: next });
    requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
  }

  return (
    <Section id="custom" title="自定义 CSS">
      <p className="Settings-note">
        写在这里的 CSS 会加到每个页面上，只对你自己的浏览器生效，边写边预览。站点颜色都是 <code>:root</code> 上的变量，比如{' '}
        <code>--body-bg</code>、<code>--text-color</code>、<code>--primary-color</code>，改它们最省事。
      </p>
      <div className="Alert" style={{ marginBottom: 14, fontSize: 12 }}>
        不要粘贴来路不明的代码：CSS 能把页面元素藏起来或伪装成别的东西，也能偷偷向外部网址发请求。样式写坏了打不开页面时，访问{' '}
        <a href={safeUrl}>{safeUrl}</a> 进入安全模式改回来。
      </div>
      {safeMode && <p className="Settings-note">当前是安全模式，下面的 CSS 不会生效，可以放心修改。</p>}
      <textarea
        className="FormControl CssEditor"
        spellCheck={false}
        value={s.customCss}
        onChange={(e) => updateAppearance({ customCss: e.target.value })}
        onKeyDown={onKeyDown}
        placeholder={':root {\n  --body-bg: #fdf6e3;\n}\n.DiscussionListItem-title {\n  font-weight: bold;\n}'}
        aria-label="自定义 CSS"
      />
    </Section>
  );
}

/* ---------- 导入导出 ---------- */

function DataSection() {
  const file = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');

  function download() {
    const url = URL.createObjectURL(new Blob([exportAppearance()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yesmiao-appearance.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      importAppearance(await f.text());
      setStatus('已导入');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '导入失败');
    }
    if (file.current) file.current.value = '';
  }

  return (
    <Section id="data" title="导入导出">
      <p className="Settings-note">这些设置只存在当前浏览器里，换设备或清理浏览器数据后会丢失。可以导出成文件备份，或者在另一台设备上导入。</p>
      <div className="Settings-inline">
        <Button icon="download" onClick={download}>
          导出设置
        </Button>
        <Button icon="upload" onClick={() => file.current?.click()}>
          导入设置
        </Button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <Button
          onClick={() => {
            if (confirm('确定把外观恢复成默认吗？屏蔽列表会保留。')) {
              resetAppearance();
              setStatus('已恢复默认');
            }
          }}
        >
          恢复默认外观
        </Button>
        {status && <span className="muted">{status}</span>}
      </div>
    </Section>
  );
}

export default function AppearancePage() {
  const s = useAppearance();
  const { hash } = useLocation();

  // 从别处带着 #custom 这样的锚点跳过来时滚到对应小节；要等 Layout 先滚回顶部
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView());
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <div className="AppearancePage container">
      <div className="Page-container">
        <aside className="Page-sidebar">
          <SideNav>
            {SECTIONS.map((x) => (
              <li key={x.id}>
                <a href={`#${x.id}`}>
                  <Icon name={x.icon} />
                  {x.label}
                </a>
              </li>
            ))}
          </SideNav>
        </aside>
        <div className="Page-content">
          <ThemeSection s={s} />
          <ReadingSection s={s} />
          <WorksSection s={s} />
          <BackgroundSection s={s} />
          <ContentSection s={s} />
          <CustomCssSection s={s} />
          <DataSection />
        </div>
      </div>
    </div>
  );
}
