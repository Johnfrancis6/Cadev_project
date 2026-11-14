import { LayoutGrid, Plus, Search, User, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { useAuth } from '../auth';
import { isActive } from './nav-items';

export function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const profilePath = profile ? `/u/${profile.handle}` : '/auth';
  const items = [
    { to: '/feed', label: t('nav.feed'), icon: LayoutGrid, match: [] as string[] },
    { to: '/circles', label: t('nav.circles'), icon: Users, match: ['/c/'] },
    null,
    { to: '/search', label: t('nav.search'), icon: Search, match: [] as string[] },
    { to: profilePath, label: t('nav.profile'), icon: User, match: ['/settings', '/saved'] },
  ];

  return (
    <nav
      aria-label={t('nav.mobile')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5 items-stretch px-1">
        {items.map((item) => {
          if (!item) {
            const active = pathname === '/p/new';
            return (
              <li key="new" className="flex items-center justify-center">
                <Link
                  to="/p/new"
                  aria-label={t('nav.newProblem')}
                  aria-current={active ? 'page' : undefined}
                  className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow transition-transform focus-ring motion-safe:active:scale-95"
                >
                  <Plus className="size-6" strokeWidth={2.2} aria-hidden="true" />
                </Link>
              </li>
            );
          }
          const active = isActive(item, pathname);
          return (
            <li key={item.to} className="flex">
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-1 rounded-md text-[0.6875rem] font-medium transition-colors focus-ring',
                  active ? 'text-brand' : 'text-muted-foreground',
                )}
              >
                {active && <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" />}
                <item.icon className="size-5" strokeWidth={1.7} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
