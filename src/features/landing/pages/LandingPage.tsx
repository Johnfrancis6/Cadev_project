import { useQuery } from '@tanstack/react-query';
import { ArrowRight, GitFork, SearchCheck, SlidersHorizontal } from 'lucide-react';
import { motion } from 'motion/react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/app/auth';
import { errorMessage } from '@/app/i18n';
import { Logo } from '@/app/layout';
import { useMotionPresets } from '@/app/motion';
import { LanguageSwitch, StatNumber, ThemeToggle } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { api, qk } from '@/lib/api';

export default function LandingPage() {
  const { t } = useTranslation('landing');
  const { t: tc } = useTranslation();
  const m = useMotionPresets();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [pending, setPending] = React.useState(false);
  const stats = useQuery({ queryKey: qk.platformStats(), queryFn: () => api.stats.platform() });

  const guest = async () => {
    setPending(true);
    try {
      await api.auth.signInGuest();
      await refresh();
      navigate('/onboarding');
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  };

  const reveal = m.reduced ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: m.transitions.slow };
  const features = [
    { icon: SlidersHorizontal, key: 'f1' },
    { icon: SearchCheck, key: 'f2' },
    { icon: GitFork, key: 'f3' },
  ] as const;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border-soft bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label={tc('nav.home')} className="focus-ring rounded-md"><Logo /></Link>
          <div className="flex items-center gap-1">
            <LanguageSwitch />
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm"><Link to="/auth">{t('signIn')}</Link></Button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="outline-none">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
          <motion.div {...m.fadeUp}>
            <p className="kicker">{t('kicker')}</p>
            <h1 className="mt-4 text-[2.75rem] leading-[1.02] font-semibold tracking-tight sm:text-6xl">
              {t('h1a')}
              <br />
              <span className="text-brand">{t('h1b')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{t('lead')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => void guest()} loading={pending}>
                {t('tryGuest')} <ArrowRight aria-hidden="true" />
              </Button>
              <Button asChild size="lg" variant="outline"><Link to="/auth?mode=signup">{t('signUp')}</Link></Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t('guestNote')}</p>
            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
              {([['members', stats.data?.members], ['solved', stats.data?.solved], ['week', stats.data?.unblockedThisWeek]] as const).map(([key, value]) => (
                <div key={key}>
                  <dd className="font-mono text-2xl font-medium tabular">{value === undefined ? '—' : <StatNumber value={value} />}</dd>
                  <dt className="mt-0.5 text-sm text-muted-foreground">{t(`stats.${key}`)}</dt>
                </div>
              ))}
            </dl>
          </motion.div>
          <motion.div {...m.fadeUp} className="relative hidden rounded-2xl border border-border bg-surface p-6 lg:block">
            <img src="/hero-art.svg" alt="" width={480} height={360} className="mx-auto w-full max-w-md" />
          </motion.div>
        </section>

        <section className="border-t border-border-soft">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('featuresTitle')}</h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {features.map(({ icon: Icon, key }, index) => (
                <motion.li key={key} {...reveal} transition={{ ...m.transitions.slow, delay: m.reduced ? 0 : index * 0.06 }} className="rounded-xl border border-border bg-surface p-6">
                  <span className="flex size-10 items-center justify-center rounded-lg border border-brand-border bg-brand-soft text-brand">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{t(`${key}.title`)}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{t(`${key}.text`)}</p>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-border-soft">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <motion.div {...reveal}>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('howTitle')}</h2>
              <ol className="mt-6 space-y-5">
                {(['s1', 's2', 's3'] as const).map((key, index) => (
                  <li key={key} className="flex gap-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border font-mono text-sm" aria-hidden="true">{index + 1}</span>
                    <div>
                      <h3 className="font-semibold">{t(`${key}.title`)}</h3>
                      <p className="mt-1 text-[0.9375rem] text-muted-foreground">{t(`${key}.text`)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </motion.div>
            <motion.div {...reveal} className="rounded-xl border border-border bg-surface p-6 sm:p-8">
              <h2 className="text-xl font-semibold">{t('ethicsTitle')}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{t('ethics')}</p>
            </motion.div>
          </div>
        </section>

        <section className="border-t border-border-soft">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('ctaTitle')}</h2>
            <Button size="lg" onClick={() => void guest()} loading={pending}>
              {t('tryGuest')} <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-soft">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <p>{t('footer')}</p>
          <Link to="/status" className="focus-ring rounded hover:text-foreground">{t('status')}</Link>
        </div>
      </footer>
    </div>
  );
}
