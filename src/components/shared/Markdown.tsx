import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { CodeBlock } from './CodeBlock';

const SAFE_PROTOCOL = /^(https?:|mailto:)/i;

/** Only http(s) and mailto links survive; everything else (javascript:, data:, relative…) is dropped. */
export function safeUrl(url: string): string {
  const trimmed = url.trim();
  return SAFE_PROTOCOL.test(trimmed) ? trimmed : '';
}

// Default GitHub-like schema, minus images from arbitrary hosts' side effects: no raw HTML is
// ever parsed (no rehype-raw), `className` is only kept on code for the language.
const schema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, href: ['http', 'https', 'mailto'], src: ['http', 'https'] },
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => tag !== 'img' && tag !== 'input' && tag !== 'details' && tag !== 'summary'),
};

function textOf(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

const components: Components = {
  a: ({ href, children }) => {
    const safe = href ? safeUrl(href) : '';
    if (!safe) return <span>{children}</span>;
    return (
      <a href={safe} target="_blank" rel="nofollow noopener noreferrer" className="font-medium text-brand underline decoration-brand-border underline-offset-4 hover:decoration-brand focus-ring rounded-xs">
        {children}
      </a>
    );
  },
  pre: ({ children }) => {
    const child = React.Children.toArray(children)[0];
    if (React.isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
      const language = /language-([\w+#-]+)/.exec(child.props.className ?? '')?.[1];
      return <CodeBlock code={textOf(child.props.children)} language={language} className="my-4" />;
    }
    return <pre>{children}</pre>;
  },
  code: ({ children, className }) => (
    <code className={cn('rounded-xs border border-border bg-surface-soft px-1.5 py-0.5 font-mono text-[0.85em] text-foreground', className)}>
      {children}
    </code>
  ),
  // Content headings start at h3: the page owns h1/h2.
  h1: ({ children }) => <h3 className="mt-6 mb-2 text-lg font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-6 mb-2 text-lg font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-5 mb-2 text-base font-semibold">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-4 mb-1.5 text-[0.9375rem] font-semibold">{children}</h5>,
  h5: ({ children }) => <h6 className="mt-4 mb-1.5 text-sm font-semibold">{children}</h6>,
  h6: ({ children }) => <h6 className="mt-4 mb-1.5 text-sm font-semibold">{children}</h6>,
  p: ({ children }) => <p className="my-3 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-faint">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:font-mono marker:text-sm marker:text-faint">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-brand-border pl-4 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-6 border-border" />,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border" tabIndex={0}>
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border bg-surface-soft px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-border-soft px-3 py-2 align-top">{children}</td>,
};

export interface MarkdownProps {
  children: string;
  className?: string;
}

/** Sanitised user markdown: GFM, no raw HTML, no images, external links only, fenced code via CodeBlock. */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div data-slot="markdown" className={cn('min-w-0 text-[0.9375rem] break-words text-foreground [&>:first-child]:mt-0 [&>:last-child]:mb-0', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, schema]]} components={components} urlTransform={safeUrl} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
