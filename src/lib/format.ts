/** 编程猫接口的时间戳都是秒 */
export function timeAgo(seconds: number): string {
  if (!seconds) return '';
  const diff = Date.now() / 1000 - seconds;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return formatDate(seconds);
}

export function formatDate(seconds: number): string {
  const d = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function compactNumber(n: number | undefined): string {
  if (n === undefined || n === null) return '0';
  if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, '')}万`;
  return String(n);
}

/** 帖子列表里的 content 是 HTML，摘要只取纯文本 */
export function htmlToText(html: string, max = 120): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = (div.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export function firstImage(html: string): string | undefined {
  const m = html.match(/<img[^>]+src="([^"]+)"/i);
  if (!m || m[1].includes('/emoji/')) return undefined;
  return m[1];
}
