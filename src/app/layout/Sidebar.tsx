import { useQuery } from '@tanstack/react-query';
import { Hash, Plus, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { qk } from '@/lib/api/keys';
import { cn } from '@/lib/utils';
import { useAuth } from '../auth';
import { Logo } from './Logo';
import { isActive, MAIN_NAV } from './nav-items';

export function Sidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const circles = useQuery({ queryKey: qk.circles(), queryFn: () => api.circles.list(), enabled: Boolean(profile) });
  const mine = (circles.data ?? []).filter((circle) => circle.viewer.isMember).slice(0, 7);

  return (
    <div className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border-soft bg-sidebar lg:flex">
      <div className="flex h-18 shrink-0 items-center gap-2 px-6">
        <Link to="/feed" aria-label={t('nav.home')} className="rounded-md focus-ring">
          <Logo />
        </Link>
        <span className="mt-1 rounded-xs border border-border-strong px-1 py-px font-mono text-[0.5625rem] tracking-wider text-muted-foreground uppercase">
          {t('app.beta')}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 pt-5 pb-4">
        <nav aria-label={t('nav.main')}>
          <p className="kicker px-3" aria-hidden="true">
            {t('nav.community')}
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {MAIN_NAV.map((item) => {
              const active = isActive(item, pathname);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150 focus-ring',
                      active ? 'bg-brand-soft font-medium text-brand' : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
                    )}
                  >
                    {active && <span aria-hidden="true" className="absolute inset-y-3 -left-3.5 w-0.5 rounded-full bg-brand" />}
                    <item.icon className="size-[1.125rem] shrink-0" strokeWidth={1.7} aria-hidden="true" />
                    {t(item.labelKey)}
                    {active && <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-brand" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <nav aria-labelledby="sidebar-circles" className="mt-9">
          <div className="flex items-center justify-between pr-1 pl-3">
            <h2 id="sidebar-circles" className="kicker">
              {t('nav.myCircles')}
            </h2>
            <Link
              to="/circles"
              aria-label={t('nav.discoverCircles')}
              className="touch-target inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-ring"
            >
              <Plus className="size-4" aria-hidden="true" />
            </Link>
          </div>
          {circles.isPending && profile ? (
            <div className="mt-4 flex flex-col gap-4 px-3" aria-hidden="true">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          ) : mine.length === 0 ? (
            <p className="mt-3 px-3 text-sm text-muted-foreground">{t('nav.noCircles')}</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-0.5">
              {mine.map((circle) => {
                const active = pathname === `/c/${circle.slug}`;
                return (
                  <li key={circle.id}>
                    <Link
                      to={`/c/${circle.slug}`}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150 focus-ring',
                        active ? 'bg-surface-hover text-foreground' : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
                      )}
                    >
                      <Hash className={cn('size-4 shrink-0', active ? 'text-brand' : 'text-faint')} aria-hidden="true" />
                      <span className="truncate">{circle.name}</span>
                      <span className="ml-auto font-mono text-xs text-faint tabular" aria-hidden="true">
                        {circle.memberCount}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>
      </div>

      {profile && (
        <div className="shrink-0 border-t border-border-soft p-3.5">
          <div className="flex items-center gap-1">
            <Link
              to={`/u/${profile.handle}`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1.5 transition-colors hover:bg-surface-hover focus-ring"
            >
              <UserAvatar user={profile} size="md" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{profile.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{profile.isGuest ? t('nav.guest') : `@${profile.handle}`}</span>
              </span>
            </Link>
            <Link
              to="/settings"
              aria-label={t('nav.settings')}
              aria-current={pathname === '/settings' ? 'page' : undefined}
              className="touch-target inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-ring"
            >
              <Settings className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
