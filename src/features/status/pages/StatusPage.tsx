import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, CircleDashed, CircleX, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Logo } from '@/app/layout';
import { ErrorState, PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, qk } from '@/lib/api';
import type { ServiceState } from '@/lib/api/contract';

const ICONS = { ok: CircleCheck, degraded: CircleAlert, down: CircleX, unconfigured: CircleDashed } as const;
const TONES = { ok: 'text-brand', degraded: 'text-warning', down: 'text-destructive', unconfigured: 'text-muted-foreground' } as const;

export default function StatusPage() {
  const { t, i18n } = useTranslation('status');
  const { t: tc } = useTranslation();
  const health = useQuery({ queryKey: qk.health(), queryFn: () => api.status.health(), refetchInterval: 30_000 });
  const data = health.data;
  const rows: [string, ServiceState][] = data
    ? [[t('database'), data.database], [t('realtime'), data.realtime], [t('semantic'), data.semanticSearch], ...data.ai.map((item): [string, ServiceState] => [t('ai', { provider: item.provider }), item.state])]
    : [];
  const overall = !data ? null : data.mode === 'local' ? 'local' : rows.every(([, state]) => state === 'ok' || state === 'unconfigured') ? 'ok' : 'degraded';

  return (
    <main id="main" tabIndex={-1} className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-10 outline-none sm:px-6">
      <Link to="/" aria-label={tc('nav.home')} className="focus-ring mb-10 inline-block rounded-md"><Logo /></Link>
      <PageHeader
        title={t('title')}
        actions={
          <>
            <Button variant="outline" onClick={() => void health.refetch()} loading={health.isFetching}><RotateCw aria-hidden="true" />{t('refresh')}</Button>
            <Button asChild variant="ghost"><Link to="/feed">{t('back')}</Link></Button>
          </>
        }
      />
      {health.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : health.isError ? (
        <ErrorState error={health.error} onRetry={() => void health.refetch()} />
      ) : (
        <div aria-live="polite">
          <div className="rounded-xl border border-brand-border bg-brand-soft p-5">
            <p className="text-lg font-semibold">{t(`overall.${overall}`)}</p>
            {overall === 'local' && <p className="mt-1 text-sm text-muted-foreground">{t('localHint')}</p>}
          </div>
          <ul className="mt-4 divide-y divide-border-soft rounded-xl border border-border bg-surface">
            {rows.map(([label, state]) => {
              const Icon = ICONS[state];
              return (
                <li key={label} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <span className="text-sm">{label}</span>
                  <span className={`flex items-center gap-2 text-sm ${TONES[state]}`}><Icon className="size-4" aria-hidden="true" />{t(`state.${state}`)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {t('checked')} : {new Date(data!.checkedAt).toLocaleTimeString(i18n.language)}
            {data!.latencyMs !== null && ` · ${t('latency', { ms: data!.latencyMs })}`}
          </p>
          <section className="mt-8">
            <h2 className="text-base font-semibold">{t('designTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('design')}</p>
          </section>
        </div>
      )}
    </main>
  );
}
