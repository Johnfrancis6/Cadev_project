import { SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { useAuth } from './auth';
import { Logo } from './layout/Logo';

export default function NotFoundPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-16">
      <Link to="/" aria-label={t('nav.home')} className="mb-10 rounded-md focus-ring">
        <Logo />
      </Link>
      <p className="kicker mb-3">404</p>
      <h1 className="sr-only">{t('states.notFoundTitle')}</h1>
      <EmptyState
        icon={SearchX}
        title={t('states.notFoundTitle')}
        description={t('states.notFoundHint')}
        className="w-full max-w-md"
        action={
          <Button asChild>
            <Link to={profile ? '/feed' : '/'}>{profile ? t('actions.goHome') : t('actions.back')}</Link>
          </Button>
        }
      />
    </main>
  );
}
