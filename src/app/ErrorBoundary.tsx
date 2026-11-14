import { Bug, RotateCw } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { Logo } from './layout/Logo';

const isChunkError = (error: unknown) =>
  /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError/i.test(String((error as Error | null)?.message ?? error));

function CrashScreen({ error, onRetry, fullPage }: { error: unknown; onRetry?: () => void; fullPage: boolean }) {
  const { t } = useTranslation();
  const retry = () => {
    // A stale deployment cannot recover in place: fetch the new index.
    if (isChunkError(error) || !onRetry) window.location.reload();
    else onRetry();
  };
  return (
    <div role="alert" className={fullPage ? 'flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-16 text-center' : 'flex flex-col items-center justify-center rounded-xl border border-border px-6 py-16 text-center'}>
      {fullPage && <Logo className="mb-10" />}
      <span className="mb-5 flex size-14 items-center justify-center rounded-full border border-border bg-surface text-brand">
        <Bug className="size-6" strokeWidth={1.6} aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">{t('states.crashTitle')}</h1>
      <p className="mt-2 max-w-md text-[0.9375rem] text-muted-foreground">{isChunkError(error) ? t('errors.network') : t('states.crashHint')}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={retry}>
          <RotateCw aria-hidden="true" />
          {t('actions.retry')}
        </Button>
        <Button variant="secondary" asChild>
          <Link to="/feed" onClick={onRetry}>{t('actions.goHome')}</Link>
        </Button>
      </div>
    </div>
  );
}

interface BoundaryProps {
  children: React.ReactNode;
  /** When this value changes the boundary resets (e.g. the pathname). */
  resetKey?: string;
  fullPage?: boolean;
}

/** Catches render errors of a page and shows a friendly retry screen; the shell stays usable. */
export class RouteErrorBoundary extends React.Component<BoundaryProps, { error: unknown; key: string | undefined }> {
  state: { error: unknown; key: string | undefined } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  static getDerivedStateFromProps(props: BoundaryProps, state: { error: unknown; key: string | undefined }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: unknown) {
    console.error('[devloop] page crashed', error);
  }

  render() {
    if (this.state.error) {
      return <CrashScreen error={this.state.error} fullPage={Boolean(this.props.fullPage)} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

/** `errorElement` of the root route: last line of defence (router/loader errors). */
export function RootErrorScreen() {
  const error = useRouteError();
  React.useEffect(() => console.error('[devloop] route error', error), [error]);
  return <CrashScreen error={error} fullPage />;
}
