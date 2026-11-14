import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { PageSkeleton } from '@/components/shared/skeletons';
import { cn } from '@/lib/utils';
import { RouteErrorBoundary } from '../ErrorBoundary';
import { BottomNav } from './BottomNav';
import { DemoBanner } from './DemoBanner';
import { RailContext, useRailState } from './right-rail';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="fixed top-3 left-3 z-[60] -translate-y-20 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform focus:translate-y-0 focus-ring"
    >
      {t('app.skipToContent')}
    </a>
  );
}

export interface AppLayoutProps {
  /** Title shown in the top bar breadcrumb (the router passes the route title). */
  title?: string | null;
  /** Optional static right rail; pages normally use <RightRail> instead. */
  rightRail?: React.ReactNode;
  /** Defaults to the router <Outlet />. */
  children?: React.ReactNode;
  /** Changing it resets the page error boundary (the router passes the pathname). */
  resetKey?: string;
}

/** Signed-in app shell: sidebar (lg+), sticky top bar, main column, right rail (xl+), bottom tabs (< lg). */
export function AppLayout({ title = null, rightRail, children, resetKey }: AppLayoutProps) {
  const { t } = useTranslation();
  const rail = useRailState();
  const showRail = rail.active || Boolean(rightRail);

  return (
    <RailContext.Provider value={rail.value}>
      <div className="min-h-dvh bg-background">
        <SkipLink />
        <Sidebar />
        <div className="flex min-h-dvh flex-col lg:pl-60">
          <DemoBanner />
          <TopBar title={title} />
          <div className="mx-auto flex w-full max-w-[84rem] flex-1 gap-8 px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
            <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-28 outline-none lg:pb-16">
              <RouteErrorBoundary resetKey={resetKey}>
                <React.Suspense fallback={<PageSkeleton />}>{children ?? <Outlet />}</React.Suspense>
              </RouteErrorBoundary>
            </main>
            <aside className={cn('hidden w-80 shrink-0 pb-16', showRail && 'xl:block')} aria-label={t('nav.aside')}>
              <div className="sticky top-26 flex flex-col gap-6">
                {rightRail}
                <div ref={rail.setNode} className="flex flex-col gap-6 empty:hidden" />
              </div>
            </aside>
          </div>
        </div>
        <BottomNav />
      </div>
    </RailContext.Provider>
  );
}
