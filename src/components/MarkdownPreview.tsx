import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createElement } from 'react';
import type { Components } from 'react-markdown';

export default function MarkdownPreview({ children, headingPrefix }: { children: string; headingPrefix?: string }) {
  const components: Components = {};
  if (headingPrefix) {
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
      components[tag] = ({ node, children: headingChildren }) => createElement(tag, { id: headingPrefix + node?.position?.start.line, tabIndex: -1 }, headingChildren);
    }
  }
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>;
}
