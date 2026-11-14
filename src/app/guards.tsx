import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './auth';
import { LogoMark } from './layout/Logo';

/** Centered mark shown while the stored session is being restored. */
export function SessionLoading() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center bg-background">
      <LogoMark className="h-8 w-9 motion-safe:animate-pulse" />
      <span className="sr-only">{t('app.loading')}</span>
    </div>
  );
}

interface FromState {
  from?: string;
}

/**
 * Signed-in routes. No session → /auth (remembering where the user was going);
 * session not onboarded → /onboarding; onboarded user on /onboarding → /feed.
 */
export function RequireAuth({ children }: { children?: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SessionLoading />;
  if (!profile) {
    return <Navigate to="/auth" replace state={{ from: location.pathname + location.search } satisfies FromState} />;
  }
  const onOnboarding = location.pathname === '/onboarding';
  if (!profile.onboarded && !onOnboarding) return <Navigate to="/onboarding" replace state={location.state} />;
  if (profile.onboarded && onOnboarding) {
    const from = (location.state as FromState | null)?.from;
    return <Navigate to={from && from.startsWith('/') && from !== '/onboarding' ? from : '/feed'} replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

/**
 * Public-only routes (`/`, `/auth`): a signed-in user is sent to where they were going
 * (`location.state.from`, set by RequireAuth) or to /feed. Pages therefore never need to
 * navigate after a successful sign-in: the redirect happens as soon as `useAuth().profile` is set.
 */
export function PublicOnly({ children }: { children?: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SessionLoading />;
  if (profile) {
    const from = (location.state as FromState | null)?.from;
    const target = from && from.startsWith('/') && !from.startsWith('//') ? from : '/feed';
    return <Navigate to={profile.onboarded ? target : '/onboarding'} replace state={{ from: target } satisfies FromState} />;
  }
  return <>{children ?? <Outlet />}</>;
}
