import { Hammer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Logo } from '@/app/layout';
import { EmptyState, PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';

/** Stub — replaced by the status feature. Full-bleed page: it owns its <main id="main">. */
export default function StatusPage() {
  const { t } = useTranslation();
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-10 outline-none sm:px-6">
      <Link to="/" aria-label={t('nav.home')} className="mb-10 self-start rounded-md focus-ring">
        <Logo />
      </Link>
      <PageHeader title={t('titles.status')} />
      <EmptyState
        icon={Hammer}
        title={t('app.comingSoon')}
        description={t('app.comingSoonHint')}
        action={
          <Button asChild variant="secondary">
            <Link to="/feed">{t('actions.continue')}</Link>
          </Button>
        }
      />
    </main>
  );
}
