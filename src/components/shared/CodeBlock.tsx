import { Check, ChevronDown, ChevronUp, Copy, FileCode2 } from 'lucide-react';
import { Highlight, type PrismTheme } from 'prism-react-renderer';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** One Prism theme for both app themes: colours are CSS variables defined in tokens.css. */
export const codeTheme: PrismTheme = {
  plain: { color: 'var(--code-text)', backgroundColor: 'transparent' },
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: 'var(--code-comment)', fontStyle: 'italic' } },
    { types: ['punctuation', 'operator'], style: { color: 'var(--code-punctuation)' } },
    { types: ['keyword', 'atrule', 'selector', 'important', 'builtin'], style: { color: 'var(--code-keyword)' } },
    { types: ['string', 'char', 'attr-value', 'regex', 'inserted', 'template-string'], style: { color: 'var(--code-string)' } },
    { types: ['function', 'class-name', 'attr-name', 'property'], style: { color: 'var(--code-function)' } },
    { types: ['number', 'boolean', 'constant', 'symbol', 'variable'], style: { color: 'var(--code-number)' } },
    { types: ['tag', 'deleted'], style: { color: 'var(--code-tag)' } },
  ],
};

const ALIASES: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript', nodejs: 'javascript',
  ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', yml: 'yaml', html: 'markup',
  xml: 'markup', svg: 'markup', vue: 'markup', golang: 'go', 'c++': 'cpp', md: 'markdown', text: 'plain', txt: 'plain',
};

const LABELS: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', jsx: 'JSX', tsx: 'TSX', python: 'Python', bash: 'Shell',
  markup: 'HTML', css: 'CSS', json: 'JSON', sql: 'SQL', go: 'Go', java: 'Java', php: 'PHP', yaml: 'YAML',
  rust: 'Rust', cpp: 'C++', c: 'C', markdown: 'Markdown', graphql: 'GraphQL', kotlin: 'Kotlin', swift: 'Swift',
};

export function normalizeLanguage(language?: string | null): string {
  const key = (language ?? '').trim().toLowerCase();
  if (!key) return 'plain';
  return ALIASES[key] ?? key;
}

export interface CodeBlockProps {
  code: string;
  language?: string | null;
  filename?: string;
  /** Lines shown before the block collapses (default 16; 0 = never collapse). */
  maxLines?: number;
  /** Called after the code was copied to the clipboard. */
  onCopy?: () => void;
  /** Called the first time the user expands a collapsed block. */
  onExpand?: () => void;
  showLineNumbers?: boolean;
  className?: string;
}

export function CodeBlock({ code, language, filename, maxLines = 16, onCopy, onExpand, showLineNumbers = true, className }: CodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const expandedOnce = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const regionId = React.useId();

  const source = code.replace(/\n+$/, '');
  const lang = normalizeLanguage(language);
  const totalLines = source.split('\n').length;
  // Collapsing only pays off when it hides at least 3 lines.
  const collapsible = maxLines > 0 && totalLines > maxLines + 2;
  const visibleLines = collapsible && !expanded ? maxLines : totalLines;

  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
    } catch {
      const area = document.createElement('textarea');
      area.value = source;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    onCopy?.();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };

  const toggle = () => {
    setExpanded((value) => {
      if (!value && !expandedOnce.current) {
        expandedOnce.current = true;
        onExpand?.();
      }
      return !value;
    });
  };

  return (
    <figure data-slot="code-block" className={cn('relative overflow-hidden rounded-lg border border-border bg-code-bg text-left', className)}>
      <figcaption className="flex min-h-10 items-center gap-2 border-b border-border bg-code-header py-1 pr-1.5 pl-3.5 font-mono text-xs text-muted-foreground">
        <FileCode2 className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{filename ?? LABELS[lang] ?? (lang === 'plain' ? t('post.codePreview') : lang)}</span>
        {filename && LABELS[lang] && <span className="ml-auto shrink-0 text-faint max-sm:hidden">{LABELS[lang]}</span>}
        <button
          type="button"
          onClick={copy}
          className={cn(
            'touch-target relative z-10 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 font-sans text-xs font-medium transition-colors focus-ring',
            'hover:bg-surface-hover hover:text-foreground',
            !(filename && LABELS[lang]) && 'ml-auto',
            copied && 'text-brand',
          )}
        >
          {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          <span aria-live="polite">{copied ? t('actions.copied') : t('actions.copy')}</span>
          <span className="sr-only">{copied ? '' : ` — ${t('actions.copyCode')}`}</span>
        </button>
      </figcaption>
      <Highlight theme={codeTheme} code={source} language={lang}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            id={regionId}
            tabIndex={0}
            className="relative z-10 overflow-x-auto py-3 font-mono text-[0.8125rem] leading-6 focus-ring [tab-size:2]"
          >
            <code className="block w-max min-w-full">
              {tokens.slice(0, visibleLines).map((line, index) => {
                const { key: _lineKey, ...lineProps } = getLineProps({ line }) as { key?: React.Key } & React.HTMLAttributes<HTMLElement>;
                return (
                  <span key={index} {...lineProps} className={cn(lineProps.className, 'flex px-3.5')}>
                    {showLineNumbers && (
                      <span aria-hidden="true" className="mr-4 w-6 shrink-0 text-right text-faint tabular select-none">
                        {index + 1}
                      </span>
                    )}
                    <span className="flex-1 whitespace-pre">
                      {line.map((token, tokenIndex) => {
                        const { key: _tokenKey, ...tokenProps } = getTokenProps({ token }) as { key?: React.Key } & React.HTMLAttributes<HTMLElement>;
                        return <span key={tokenIndex} {...tokenProps} />;
                      })}
                    </span>
                  </span>
                );
              })}
            </code>
          </pre>
        )}
      </Highlight>
      {collapsible && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={regionId}
          className="relative z-10 flex min-h-9 w-full items-center justify-center gap-1.5 border-t border-border bg-code-header px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-ring touch:min-h-11"
        >
          {expanded ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
          {expanded ? t('actions.collapse') : `${t('actions.expand')} · ${t('post.linesMore', { count: totalLines - maxLines })}`}
        </button>
      )}
    </figure>
  );
}
