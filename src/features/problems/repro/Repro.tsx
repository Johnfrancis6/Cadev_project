import { Play, RotateCcw } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Repro } from '@/lib/api/contract';
import { cn } from '@/lib/utils';

interface Line {
  level: 'log' | 'info' | 'warn' | 'error';
  text: string;
}

const MAX_LINES = 200;

/**
 * Runs a repro in `/sandbox.html`, framed with sandbox="allow-scripts" (opaque origin: no access
 * to the app's storage, cookies or DOM). Output comes back through postMessage as plain text.
 */
export function ReproRunner({ repro, onRun, className }: { repro: Repro; onRun?: () => void; className?: string }) {
  const { t } = useTranslation('problems');
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [run, setRun] = React.useState(0);
  const [lines, setLines] = React.useState<Line[]>([]);
  const [done, setDone] = React.useState(false);
  const latest = React.useRef(repro);
  latest.current = repro;

  React.useEffect(() => {
    if (run === 0) return;
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const data = event.data as { source?: string; type?: string; level?: string; text?: unknown } | null;
      if (!data || data.source !== 'devloop-sandbox') return;
      if (data.type === 'ready') {
        const { html, css, js } = latest.current;
        frame.current.contentWindow?.postMessage({ source: 'devloop-app', type: 'run', html, css, js }, '*');
      } else if (data.type === 'console') {
        const level = (['log', 'info', 'warn', 'error'] as const).find((l) => l === data.level) ?? 'log';
        setLines((current) => (current.length >= MAX_LINES ? current : [...current, { level, text: String(data.text ?? '').slice(0, 2000) }]));
      } else if (data.type === 'done') setDone(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [run]);

  const start = () => {
    setLines([]);
    setDone(false);
    setRun((n) => n + 1);
    onRun?.();
  };

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-surface', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border-soft px-3 py-2">
        <p className="text-xs text-muted-foreground">{t('repro.sandboxNote')}</p>
        <div className="flex gap-2">
          {run > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setRun(0); setLines([]); setDone(false); }}>
              <RotateCcw aria-hidden="true" />
              {t('repro.reset')}
            </Button>
          )}
          <Button size="sm" onClick={start}>
            <Play aria-hidden="true" />
            {t('repro.run')}
          </Button>
        </div>
      </div>
      <div className="grid md:grid-cols-2">
        <div className="h-48 border-b border-border-soft bg-white md:border-r md:border-b-0">
          {run > 0 && (
            <iframe
              key={run}
              ref={frame}
              src="/sandbox.html"
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              title={t('repro.preview')}
              className="size-full"
            />
          )}
        </div>
        <div className="h-48 overflow-auto bg-code-bg p-3" role="log" aria-live="polite" aria-label={t('repro.console')}>
          <p className="kicker mb-2">{t('repro.console')}</p>
          {lines.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">{run > 0 && done ? t('repro.consoleSilent') : t('repro.consoleEmpty')}</p>
          ) : (
            <ol className="space-y-1 font-mono text-xs">
              {lines.map((line, index) => (
                <li key={index} className={cn('break-words whitespace-pre-wrap', line.level === 'error' && 'text-destructive', line.level === 'warn' && 'text-warning')}>
                  <span aria-hidden="true" className="mr-2 text-faint">{line.level === 'error' ? '✕' : line.level === 'warn' ? '!' : '›'}</span>
                  <span className="sr-only">{line.level}: </span>
                  {line.text}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

const FILES = ['html', 'css', 'js'] as const;

export function ReproEditor({ value, onChange }: { value: Repro; onChange: (value: Repro) => void }) {
  const { t } = useTranslation('problems');
  const [file, setFile] = React.useState<(typeof FILES)[number]>('js');
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border">
        <div role="tablist" className="flex border-b border-border-soft bg-surface-soft">
          {FILES.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={file === name}
              onClick={() => setFile(name)}
              className={cn('focus-ring h-10 px-4 font-mono text-xs uppercase', file === name ? 'bg-surface text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {name}
            </button>
          ))}
        </div>
        <textarea
          aria-label={t('repro.editorLabel', { file: file.toUpperCase() })}
          value={value[file]}
          onChange={(event) => onChange({ ...value, [file]: event.target.value })}
          spellCheck={false}
          rows={9}
          className="block w-full resize-y bg-code-bg p-3 font-mono text-[0.8125rem] leading-relaxed text-code-text outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        />
      </div>
      <ReproRunner repro={value} />
    </div>
  );
}

export const EMPTY_REPRO: Repro = {
  html: '<button id="btn">Clique</button>\n<p id="out"></p>',
  css: 'button { padding: 8px 12px; }',
  js: "document.getElementById('btn').addEventListener('click', () => {\n  console.log('clic');\n});",
};
