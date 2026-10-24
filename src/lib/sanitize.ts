import DOMPurify from 'dompurify';

// 把指向官方社区的链接改写成站内链接
const INTERNAL_LINKS: [RegExp, string][] = [
  [/^https?:\/\/shequ\.codemao\.cn\/community\/(\d+)/, '/d/$1'],
  [/^https?:\/\/shequ\.codemao\.cn\/work\/(\d+)/, '/work/$1'],
  [/^https?:\/\/shequ\.codemao\.cn\/user\/(\d+)/, '/u/$1'],
];

// 官方编辑器、旧版微博表情和编辑器缩略图表情，都按行内表情显示
const EMOJI_RE = /\/emoji\/|\/asset\/thumb\/|sinajs\.cn\/.*\/expression\//;

// 官方编辑器写的是绝对字号（medium = 16px），换成相对正文的大小，正文字号才统一
const FONT_SIZES: Record<string, string> = {
  'xx-small': '0.75em',
  'x-small': '0.8em',
  small: '0.9em',
  medium: '',
  large: '1.15em',
  'x-large': '1.4em',
  'xx-large': '1.7em',
};

/** 接近纯黑或纯白的颜色：作者本意是“默认颜色”，保留的话在另一种主题下会看不见 */
function isNeutral(color: string) {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((v) => Number(v) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.12 || lum > 0.9;
}

function normalizeStyle(el: HTMLElement) {
  const { style } = el;
  const size = style.fontSize;
  if (size in FONT_SIZES) style.fontSize = FONT_SIZES[size];
  else if (size.endsWith('px')) style.fontSize = `${parseFloat(size) / 16}em`;
  if (style.color && isNeutral(style.color)) style.color = '';
  if (style.backgroundColor && isNeutral(style.backgroundColor)) style.backgroundColor = '';
  if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') || '';
    const internal = INTERNAL_LINKS.find(([re]) => re.test(href));
    if (internal) {
      node.setAttribute('href', href.replace(internal[0], internal[1]));
      node.removeAttribute('target');
    } else {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  }
  if (node.tagName === 'IMG') {
    node.setAttribute('loading', 'lazy');
    node.setAttribute('referrerpolicy', 'no-referrer');
    if (EMOJI_RE.test(node.getAttribute('src') || '')) node.setAttribute('data-emoji', '');
  }
  if (node instanceof HTMLElement && node.hasAttribute('style')) normalizeStyle(node);
});

/** 帖子和回帖内容是用户提交的 HTML，渲染前必须过滤 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['class', 'id'],
  });
}
