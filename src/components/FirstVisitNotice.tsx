import { useEffect, useState, type SyntheticEvent } from 'react';
import { Button } from './ui';

/* 第一次打开网站时的声明：不能关闭，必须手动输入确认语才能继续 */

const KEY = 'yesmiao-notice';
// 声明内容有实质改动时改这个值，所有人重新确认一次
const VERSION = '1';
const PHRASE = '我已阅读并确认此项目非官方项目';

function confirmed() {
  try {
    return localStorage.getItem(KEY) === VERSION;
  } catch {
    return false;
  }
}

const block = (e: SyntheticEvent) => e.preventDefault();

export default function FirstVisitNotice() {
  const [open, setOpen] = useState(() => !confirmed());
  const [text, setText] = useState('');
  const ok = text.trim() === PHRASE;

  // 弹窗打开时锁住背后的页面滚动
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  function accept() {
    if (!ok) return;
    try {
      localStorage.setItem(KEY, VERSION);
    } catch {
      // 存不下（隐私模式等）时只在本次访问内生效
    }
    setOpen(false);
  }

  return (
    <div className="ModalManager">
      <div className="Modal Modal--notice" role="dialog" aria-modal="true" aria-labelledby="notice-title">
        <div className="Modal-header">
          <h3 id="notice-title">使用前请阅读</h3>
        </div>
        <div className="Modal-body">
          <ol className="Notice-list">
            <li>
              此网站（YesMiao）是由 HachimLab 自主制作的第三方编程猫社区前端，通过 API 访问编程猫并在此前端内显示。由于编程猫 API 带有 CORS 限制，所有请求将从此网站服务器转发，我们不会记录任何数据，请放心。
            </li>
            <li>
              本网站使用 MIT 协议开源，开源地址：
              <a href="https://github.com/hachimlab/yesmiao" target="_blank" rel="noopener noreferrer">
                https://github.com/hachimlab/yesmiao
              </a>
              。若有个人部署需要，请在 README 中确认。
            </li>
            <li>本网站有且只有的第三方 API 为：CodemaoUserDB，由 HachimLab 创建，用于补全用户搜索功能。</li>
            <li>本网站与编程猫官方无关，为独立项目。我们不代表官方立场，请仔细辨别信息。</li>
            <li>
              若您已确认，请在下方输入框输入“<span className="Notice-phrase" onCopy={block} onCut={block}>{PHRASE}</span>”
            </li>
          </ol>
          <form
            className="Form"
            onSubmit={(e) => {
              e.preventDefault();
              accept();
            }}
          >
            <input
              className="FormControl"
              placeholder="请手动输入上方的确认语"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={block}
              onDrop={block}
              onCopy={block}
              onCut={block}
              onContextMenu={block}
              onBeforeInput={(e) => {
                const type = (e.nativeEvent as InputEvent).inputType;
                if (type === 'insertFromPaste' || type === 'insertFromDrop' || type === 'insertReplacementText') e.preventDefault();
              }}
              autoComplete="off"
              spellCheck={false}
              aria-label="确认语"
              autoFocus
            />
            <Button variant="primary" block type="submit" disabled={!ok}>
              {ok ? '我已确认，继续' : '请输入确认语'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
