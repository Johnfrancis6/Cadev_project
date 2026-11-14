import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/app/i18n';
import { Logo } from '@/app/layout';
import { PageHeader } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

/** Stub — replaced by the auth feature. PublicOnly redirects as soon as a session exists. */
export default function AuthPage() {
  const { t } = useTranslation();
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 outline-none sm:px-6">
      <Link to="/" aria-label={t('nav.home')} className="mb-10 self-start rounded-md focus-ring">
        <Logo />
      </Link>
      <PageHeader title={t('titles.auth')} description={t('app.comingSoonHint')} />
      <Button size="lg" onClick={() => api.auth.signInGuest().catch((error) => toast.error(errorMessage(error)))}>
        {t('nav.guest')} · {t('actions.continue')}
      </Button>
    </main>
  );
}
