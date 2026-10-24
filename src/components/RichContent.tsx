import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { sanitizeHtml } from '../lib/sanitize';

/** 点开帖子里的图片看大图；点任意处或按 Esc 关闭 */
function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return createPortal(
    <div className="ImageViewer" onClick={onClose} role="dialog" aria-label="查看图片">
      <img src={src} alt="" referrerPolicy="no-referrer" />
    </div>,
    document.body,
  );
}

/** 渲染用户提交的 HTML；站内链接走前端路由，不整页刷新 */
export default function RichContent({ html, className = '' }: { html: string; className?: string }) {
  const navigate = useNavigate();
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  const [zoomed, setZoomed] = useState<string | null>(null);

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const a = target.closest('a');
    if (!a && target instanceof HTMLImageElement && !target.hasAttribute('data-emoji')) {
      setZoomed(target.src);
      return;
    }
    const href = a?.getAttribute('href');
    if (href && href.startsWith('/') && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      navigate(href);
    }
  }

  return (
    <>
      <div className={`rich ${className}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: clean }} />
      {zoomed && <ImageViewer src={zoomed} onClose={() => setZoomed(null)} />}
    </>
  );
}
