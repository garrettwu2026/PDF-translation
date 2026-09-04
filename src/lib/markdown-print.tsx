import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import MarkdownPreview from '../components/MarkdownPreview';
import { printElementToPdf } from './browser-exports';

/** Full document DOM exists only while preparing an export, not while reading the book. */
export function printMarkdown(markdown: string, title: string) {
  const host = document.createElement('div');
  host.hidden = true;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<article><MarkdownPreview>{markdown}</MarkdownPreview></article>));
    const article = host.querySelector('article');
    if (!article) throw new Error('無法建立完整匯出內容');
    printElementToPdf(article, title);
  } finally {
    root.unmount();
    host.remove();
  }
}
