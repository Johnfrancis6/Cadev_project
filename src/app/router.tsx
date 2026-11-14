import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { createBrowserRouter, Outlet, ScrollRestoration, useLocation, useMatches, type RouteObject } from 'react-router';
import { PageSkeleton } from '@/components/shared/skeletons';
import { RootErrorScreen, RouteErrorBoundary } from './ErrorBoundary';
import { PublicOnly, RequireAuth, SessionLoading } from './guards';
import { AppLayout, SkipLink } from './layout/AppLayout';
import { setBaseTitle } from './page-title';

// Route-level code splitting: one chunk per page.
const LandingPage = React.lazy(() => import('@/features/landing/pages/LandingPage'));
const AuthPage = React.lazy(() => import('@/features/auth/pages/AuthPage'));
const OnboardingPage = React.lazy(() => import('@/features/onboarding/pages/OnboardingPage'));
const FeedPage = React.lazy(() => import('@/features/feed/pages/FeedPage'));
const NewProblemPage = React.lazy(() => import('@/features/problems/pages/NewProblemPage'));
const ProblemPage = React.lazy(() => import('@/features/problems/pages/ProblemPage'));
const CirclesPage = React.lazy(() => import('@/features/circles/pages/CirclesPage'));
const CirclePage = React.lazy(() => import('@/features/circles/pages/CirclePage'));
const SearchPage = React.lazy(() => import('@/features/search/pages/SearchPage'));
const ProfilePage = React.lazy(() => import('@/features/profile/pages/ProfilePage'));
const SavedPage = React.lazy(() => import('@/features/profile/pages/SavedPage'));
const SettingsPage = React.lazy(() => import('@/features/profile/pages/SettingsPage'));
const StatusPage = React.lazy(() => import('@/features/status/pages/StatusPage'));
const NotFoundPage = React.lazy(() => import('./NotFoundPage'));
const KitchenSinkPage = React.lazy(() => import('./dev/KitchenSinkPage'));

/** Route handle: `titleKey` is a key of the `common` namespace (`titles.*`). */
interface RouteHandle {
  titleKey?: string;
}
const title = (key: string): RouteHandle => ({ titleKey: `titles.${key}` });

function useRouteTitle(): string | null {
  const { t } = useTranslation();
  const matches = useMatches();
  const key = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.titleKey)?.handle as RouteHandle | undefined;
  return key?.titleKey ? t(key.titleKey) : null;
}

/** Root element: document title, scroll restoration, focus management on navigation. */
function Root() {
  const routeTitle = useRouteTitle();
  const { pathname } = useLocation();
  const first = React.useRef(true);

  React.useEffect(() => setBaseTitle(routeTitle), [routeTitle]);

  // Move focus to the main region on navigation so keyboard and screen-reader users start at the new page.
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <>
      <Outlet />
      <ScrollRestoration />
    </>
  );
}

/** Full-bleed pages (landing, auth, status, onboarding): no shell chrome, own <main>. */
function BareLayout() {
  const { pathname } = useLocation();
  return (
    <>
      <SkipLink />
      <RouteErrorBoundary resetKey={pathname} fullPage>
        <React.Suspense fallback={<SessionLoading />}>
          <Outlet />
        </React.Suspense>
      </RouteErrorBoundary>
    </>
  );
}

function ShellLayout() {
  const routeTitle = useRouteTitle();
  const { pathname } = useLocation();
  return <AppLayout title={routeTitle} resetKey={pathname} />;
}

function DevShell() {
  const { pathname } = useLocation();
  return (
    <AppLayout title="Kitchen sink" resetKey={pathname}>
      <React.Suspense fallback={<PageSkeleton />}>
        <Outlet />
      </React.Suspense>
    </AppLayout>
  );
}

export const routes: RouteObject[] = [
  {
    element: <Root />,
    errorElement: <RootErrorScreen />,
    children: [
      {
        element: <BareLayout />,
        children: [
          { element: <PublicOnly />, children: [
            { path: '/', element: <LandingPage />, handle: title('landing') },
            { path: '/auth', element: <AuthPage />, handle: title('auth') },
          ] },
          { path: '/status', element: <StatusPage />, handle: title('status') },
          { element: <RequireAuth />, children: [{ path: '/onboarding', element: <OnboardingPage />, handle: title('onboarding') }] },
          { path: '*', element: <NotFoundPage />, handle: title('notFound') },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <ShellLayout />,
            children: [
              { path: '/feed', element: <FeedPage />, handle: title('feed') },
              { path: '/p/new', element: <NewProblemPage />, handle: title('newProblem') },
              { path: '/p/:id', element: <ProblemPage />, handle: title('problem') },
              { path: '/circles', element: <CirclesPage />, handle: title('circles') },
              { path: '/c/:slug', element: <CirclePage />, handle: title('circle') },
              { path: '/search', element: <SearchPage />, handle: title('search') },
              { path: '/u/:handle', element: <ProfilePage />, handle: title('profile') },
              { path: '/saved', element: <SavedPage />, handle: title('saved') },
              { path: '/settings', element: <SettingsPage />, handle: title('settings') },
            ],
          },
        ],
      },
      // Component gallery for the team (no auth needed).
      { element: <DevShell />, children: [{ path: '/dev/kitchen-sink', element: <KitchenSinkPage />, handle: title('kitchenSink') }] },
    ],
  },
];

export const router = createBrowserRouter(routes);
