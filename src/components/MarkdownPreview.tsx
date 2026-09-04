import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createElement, memo } from 'react';
import type { Components } from 'react-markdown';

function MarkdownPreview({ children, headingPrefix, lineOffset = 0 }: { children: string; headingPrefix?: string; lineOffset?: number }) {
  const components: Components = {};
  if (headingPrefix) {
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
      components[tag] = ({ node, children: headingChildren }) => createElement(tag, { id: headingPrefix + ((node?.position?.start.line ?? 1) + lineOffset), tabIndex: -1 }, headingChildren);
    }
  }
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>;
}
export default memo(MarkdownPreview);
