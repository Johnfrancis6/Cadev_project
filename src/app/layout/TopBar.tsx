import { Activity, Bookmark, LogOut, Plus, Search, Settings, User } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { LanguageSwitch, ThemeToggle } from '@/components/shared/switches';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { isMac } from '@/lib/utils';
import { useAuth } from '../auth';
import { errorMessage } from '../i18n';
import { Logo } from './Logo';
import { OPEN_SEARCH_EVENT } from './nav-items';
import { Notifications } from './Notifications';

/** Opens the ⌘K palette if a feature handles the event, otherwise goes to /search. */
export function useOpenSearch(): () => void {
  const navigate = useNavigate();
  return React.useCallback(() => {
    const event = new CustomEvent(OPEN_SEARCH_EVENT, { cancelable: true });
    const unhandled = window.dispatchEvent(event);
    if (unhandled) navigate('/search');
  }, [navigate]);
}

function AccountMenu() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  if (!profile) {
    return (
      <Button asChild size="sm">
        <Link to="/auth">{t('nav.signIn')}</Link>
      </Button>
    );
  }
  const onSignOut = async () => {
    try {
      await signOut();
      toast(t('nav.signedOut'));
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('nav.accountMenu')}
        className="touch-target ml-1 rounded-full border border-border-strong p-0.5 transition-colors hover:border-brand focus-ring"
      >
        <UserAvatar user={profile} size="sm" className="size-8" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="truncate text-sm font-semibold text-foreground">{profile.displayName}</span>
          <span className="truncate font-normal">{profile.isGuest ? t('nav.guest') : `@${profile.handle}`}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={`/u/${profile.handle}`}>
            <User aria-hidden="true" />
            {t('nav.profile')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/saved">
            <Bookmark aria-hidden="true" />
            {t('nav.saved')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings aria-hidden="true" />
            {t('nav.settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/status">
            <Activity aria-hidden="true" />
            {t('nav.status')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut aria-hidden="true" />
          {t('nav.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar({ title }: { title: string | null }) {
  const { t } = useTranslation();
  const openSearch = useOpenSearch();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchText, setSearchText] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        // Desktop: focus the search field; phones (field hidden): open the search page.
        if (searchRef.current && searchRef.current.offsetParent !== null) searchRef.current.focus();
        else openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);

  return (
    <header className="sticky top-0 z-30 border-b border-border-soft bg-background/90 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:h-18 lg:gap-3 lg:px-8">
        <Link to="/feed" aria-label={t('nav.home')} className="rounded-md focus-ring lg:hidden">
          <Logo size="sm" />
        </Link>
        <p className="hidden items-center gap-3 text-sm text-muted-foreground lg:flex" aria-hidden="true">
          <span>{t('nav.community')}</span>
          {title && (
            <>
              <span className="text-border-strong">/</span>
              <span className="font-medium text-foreground">{title}</span>
            </>
          )}
        </p>

        <div className="ml-auto flex items-center gap-1 lg:gap-1.5">
          <form
            role="search"
            className="relative mr-2 hidden md:block"
            onSubmit={(event) => {
              event.preventDefault();
              const query = searchText.trim();
              navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
              setSearchText('');
              searchRef.current?.blur();
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t('nav.searchPlaceholder')}
              aria-label={t('nav.openSearch')}
              aria-keyshortcuts="Meta+K Control+K"
              className="h-10 w-72 rounded-md border border-border bg-surface pr-16 pl-9 text-sm text-foreground transition-colors placeholder:text-muted-foreground hover:border-border-strong focus-ring xl:w-80"
            />
            <Kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2" aria-hidden="true">
              {isMac() ? '⌘' : 'Ctrl'} K
            </Kbd>
          </form>
          <Button variant="ghost" size="icon" onClick={openSearch} aria-label={t('nav.openSearch')} className="md:hidden">
            <Search className="!size-[1.125rem]" aria-hidden="true" />
          </Button>
          {profile && <Notifications />}
          <LanguageSwitch className="max-sm:hidden" />
          <ThemeToggle />
          {profile && (
            <Button asChild size="sm" className="mx-1.5 hidden h-9 lg:inline-flex">
              <Link to="/p/new">
                <Plus aria-hidden="true" />
                {t('nav.newProblem')}
              </Link>
            </Button>
          )}
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
