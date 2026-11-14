import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Compass, Download, Eye, Rocket, SlidersHorizontal, Sprout, TreePine, Trees, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth, useProfile } from '@/app/auth';
import { errorMessage, interestLabel } from '@/app/i18n';
import { Logo } from '@/app/layout';
import { useMotionPresets } from '@/app/motion';
import { ErrorState, LanguageSwitch, ThemeToggle } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, qk } from '@/lib/api';
import type { ApiErrorCode, GithubImport, Interest, Level } from '@/lib/api/contract';
import { cn } from '@/lib/utils';

const LEVELS: { value: Level; icon: LucideIcon }[] = [
  { value: 'beginner', icon: Sprout },
  { value: 'intermediate', icon: TreePine },
  { value: 'senior', icon: Trees },
];
const MIN_INTERESTS = 3;
const DEFAULT_WEIGHT = 0.5;
const STEPS = 3;
const GITHUB_LOGIN = /^[a-zA-Z\d](?:[a-zA-Z\d-]{0,37}[a-zA-Z\d])?$/;

export default function OnboardingPage() {
  const { t, i18n } = useTranslation('onboarding');
  const profile = useProfile();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const m = useMotionPresets();
  const id = React.useId();

  const [step, setStep] = React.useState(0);
  const [displayName, setDisplayName] = React.useState(profile.displayName);
  const [level, setLevel] = React.useState<Level>(profile.level);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [login, setLogin] = React.useState(profile.githubLogin ?? '');
  const [imported, setImported] = React.useState<GithubImport | null>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [nameError, setNameError] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const interestsQuery = useQuery({ queryKey: qk.interests(), queryFn: () => api.interests.list(), staleTime: 5 * 60_000 });
  const interests = React.useMemo(() => interestsQuery.data ?? [], [interestsQuery.data]);
  const bySlug = React.useMemo(() => new Map(interests.map((i) => [i.slug, i])), [interests]);

  const importMutation = useMutation({
    mutationFn: (value: string) => api.interests.importFromGithub(value),
    onMutate: () => setImportError(null),
    onSuccess: (result) => {
      setImported(result);
      if (result.suggestions.length === 0) return;
      setSelected((current) => [...new Set([...current, ...result.suggestions.map((s) => s.slug)])]);
    },
    onError: (error) => {
      const code = (error as { code?: ApiErrorCode } | null)?.code;
      setImported(null);
      setImportError(code === 'not_found' ? t('github.notFound') : code === 'rate_limited' ? t('github.rateLimited') : code === 'network' ? t('github.network') : errorMessage(error));
    },
  });

  const finish = useMutation({
    mutationFn: async () => {
      // Only keep what exists in the catalogue when it is known.
      const slugs = interests.length > 0 ? selected.filter((slug) => bySlug.has(slug)) : selected;
      await api.profiles.completeOnboarding({ level, interestSlugs: slugs, displayName: displayName.trim() });
      const fromGithub = (imported?.suggestions ?? []).filter((s) => slugs.includes(s.slug));
      if (fromGithub.length > 0) {
        // Best effort: the onboarding itself is already saved.
        await api.interests.saveMany(fromGithub.map((s) => ({ slug: s.slug, weight: s.weight, source: 'github' as const }))).catch(() => undefined);
      }
      await refresh();
    },
    onSuccess: () => {
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith('/') && !from.startsWith('//') && from !== '/onboarding' ? from : '/feed', { replace: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Move focus to the step title when the step changes (keyboard and screen-reader users).
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  if (profile.onboarded && !finish.isPending && !finish.isSuccess) return <Navigate to="/feed" replace />;

  const toggle = (slug: string) => setSelected((current) => (current.includes(slug) ? current.filter((s) => s !== slug) : [...current, slug]));
  const nameValid = displayName.trim().length >= 2;
  const enough = selected.length >= MIN_INTERESTS;
  const canNext = step === 0 ? nameValid : step === 1 ? enough : true;

  const goNext = () => {
    if (step === 0 && !nameValid) {
      setNameError(true);
      document.getElementById(`${id}-name`)?.focus();
      return;
    }
    if (step === 1 && !enough) return;
    if (step < STEPS - 1) setStep(step + 1);
    else finish.mutate();
  };

  const onImport = (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const value = login.trim().replace(/^@/, '');
    if (!value) return;
    if (!GITHUB_LOGIN.test(value)) {
      setImported(null);
      setImportError(t('github.invalid'));
      return;
    }
    importMutation.mutate(value);
  };

  const weightOf = (slug: string) => imported?.suggestions.find((s) => s.slug === slug)?.weight ?? DEFAULT_WEIGHT;
  const recap = selected
    .map((slug) => ({ slug, interest: bySlug.get(slug), weight: weightOf(slug), github: Boolean(imported?.suggestions.some((s) => s.slug === slug)) }))
    .sort((a, b) => b.weight - a.weight);
  const label = (slug: string, interest?: Interest) => (interest ? interestLabel(interest, i18n.language) : slug);
  const titles = [t('step1.title', { name: profile.isGuest ? '' : profile.displayName.split(' ')[0] }).replace(/\s+([,!?])/g, '$1').replace(/, !/, ' !'), t('step2.title'), t('step3.title')];
  const subtitles = [t('step1.subtitle'), t('step2.subtitle'), t('step3.subtitle')];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to="/" aria-label={t('common:nav.home')} className="rounded-md focus-ring">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <ThemeToggle />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-2 pb-10 outline-none sm:px-6 sm:pt-6">
        {/* Progress */}
        <div className="mb-8">
          <p className="kicker mb-3" aria-live="polite">
            {t('progress', { current: step + 1, total: STEPS })} · {t(`stepNames.${step}`)}
          </p>
          <ol className="flex gap-2" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, index) => (
              <li key={index} className={cn('h-1 flex-1 rounded-full transition-colors duration-200', index <= step ? 'bg-brand' : 'bg-border-strong')} />
            ))}
          </ol>
        </div>

        <form
          noValidate
          className="flex flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            goNext();
          }}
        >
          <motion.div key={step} {...m.fadeUp} className="flex-1">
            <h1 ref={headingRef} tabIndex={-1} className="text-[1.75rem] leading-tight font-semibold tracking-tight outline-none sm:text-[2rem]">
              {titles[step]}
            </h1>
            <p className="mt-2 max-w-xl text-[0.9375rem] text-muted-foreground">{subtitles[step]}</p>

            {step === 0 && (
              <div className="mt-8 flex flex-col gap-8">
                <div className="flex max-w-sm flex-col gap-2">
                  <Label htmlFor={`${id}-name`}>{t('step1.nameLabel')}</Label>
                  <Input
                    id={`${id}-name`}
                    name="name"
                    autoComplete="name"
                    maxLength={40}
                    value={displayName}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                      setNameError(false);
                    }}
                    aria-invalid={nameError ? true : undefined}
                    aria-describedby={`${id}-name-hint`}
                  />
                  <p id={`${id}-name-hint`} className={cn('text-[0.8125rem]', nameError ? 'text-destructive' : 'text-muted-foreground')}>
                    {nameError ? t('step1.nameError') : t('step1.nameHint')}
                  </p>
                </div>

                <fieldset>
                  <legend className="mb-3 text-sm font-medium">{t('step1.levelLabel')}</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {LEVELS.map(({ value, icon: Icon }) => {
                      const active = level === value;
                      return (
                        <label
                          key={value}
                          className={cn(
                            'relative flex cursor-pointer gap-3 rounded-xl border bg-surface p-4 transition-colors duration-150 sm:flex-col sm:p-5',
                            'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                            active ? 'border-brand bg-brand-soft' : 'border-border hover:border-border-strong',
                          )}
                        >
                          <input type="radio" name="level" value={value} checked={active} onChange={() => setLevel(value)} className="sr-only" aria-describedby={`${id}-level-${value}`} />
                          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg border', active ? 'border-brand-border text-brand' : 'border-border text-muted-foreground')}>
                            <Icon className="size-5" strokeWidth={1.6} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold">{t(`common:levels.${value}`)}</span>
                            <span id={`${id}-level-${value}`} className="mt-1 block text-sm text-muted-foreground">
                              {t(`step1.levels.${value}`)}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className={cn(
                              'flex size-5 shrink-0 items-center justify-center rounded-full border sm:absolute sm:top-4 sm:right-4',
                              active ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                            )}
                          >
                            {active && <Check className="size-3" strokeWidth={3} />}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            )}

            {step === 1 && (
              <div className="mt-8 flex flex-col gap-8">
                {/* GitHub cold start. Nested <form> is not allowed: Enter is handled on the input. */}
                <section aria-labelledby={`${id}-gh`} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
                  <h2 id={`${id}-gh`} className="text-[0.9375rem] font-semibold">
                    {t('github.title')}
                  </h2>
                  <p id={`${id}-gh-hint`} className="mt-1 text-sm text-muted-foreground">
                    {t('github.hint')}
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex flex-1 flex-col gap-2">
                      <Label htmlFor={`${id}-login`}>{t('github.label')}</Label>
                      <Input
                        id={`${id}-login`}
                        name="github"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="octocat"
                        value={login}
                        onChange={(event) => setLogin(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') onImport(event);
                        }}
                        aria-describedby={`${id}-gh-hint ${id}-gh-result`}
                        className="font-mono text-sm"
                      />
                    </div>
                    <Button variant="secondary" onClick={onImport} loading={importMutation.isPending} disabled={!login.trim()}>
                      {!importMutation.isPending && <Download aria-hidden="true" />}
                      {t('github.import')}
                    </Button>
                  </div>
                  <div id={`${id}-gh-result`} aria-live="polite" className="empty:hidden">
                    {importError && <p className="mt-3 text-sm text-destructive">{importError}</p>}
                    {imported && imported.suggestions.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t('github.empty', { login: imported.login })}</p>}
                    {imported && imported.suggestions.length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm text-muted-foreground">{t('github.found', { count: imported.suggestions.length, login: imported.login })}</p>
                        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                          {imported.suggestions.map((s) => {
                            const active = selected.includes(s.slug);
                            return (
                              <li key={s.slug}>
                                <button
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => toggle(s.slug)}
                                  className={cn(
                                    'flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-ring',
                                    active ? 'border-brand-border bg-brand-soft' : 'border-border hover:border-border-strong',
                                  )}
                                >
                                  <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-sm border', active ? 'border-primary bg-primary text-primary-foreground' : 'border-input')} aria-hidden="true">
                                    {active && <Check className="size-3" strokeWidth={3} />}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">{label(s.slug, bySlug.get(s.slug))}</span>
                                    <span className="block truncate font-mono text-xs text-muted-foreground">{s.evidence}</span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>

                <section aria-labelledby={`${id}-grid`}>
                  <div className="mb-3 flex items-baseline justify-between gap-4">
                    <h2 id={`${id}-grid`} className="text-[0.9375rem] font-semibold">
                      {t('step2.gridTitle')}
                    </h2>
                    <p aria-live="polite" className={cn('font-mono text-xs tabular', enough ? 'text-brand' : 'text-muted-foreground')}>
                      {enough ? t('step2.counterOk', { count: selected.length }) : t('step2.counter', { count: selected.length, min: MIN_INTERESTS })}
                    </p>
                  </div>
                  {interestsQuery.isPending ? (
                    <div role="status" aria-busy="true" className="flex flex-wrap gap-2">
                      <span className="sr-only">{t('common:app.loading')}</span>
                      {Array.from({ length: 14 }, (_, index) => (
                        <Skeleton key={index} className="h-10 rounded-full" style={{ width: `${5 + ((index * 7) % 5)}rem` }} />
                      ))}
                    </div>
                  ) : interestsQuery.isError ? (
                    <ErrorState error={interestsQuery.error} onRetry={() => void interestsQuery.refetch()} retrying={interestsQuery.isFetching} />
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {interests.map((interest) => {
                        const active = selected.includes(interest.slug);
                        return (
                          <li key={interest.slug}>
                            <button
                              type="button"
                              aria-pressed={active}
                              onClick={() => toggle(interest.slug)}
                              className={cn(
                                'inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors duration-150 focus-ring touch:h-11',
                                active ? 'border-brand bg-brand-soft font-medium text-brand' : 'border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-hover',
                              )}
                            >
                              {active && <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />}
                              {interestLabel(interest, i18n.language)}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}

            {step === 2 && (
              <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <section aria-labelledby={`${id}-recap`} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
                  <h2 id={`${id}-recap`} className="kicker mb-4">
                    {t('step3.weights')}
                  </h2>
                  <ul className="flex flex-col gap-3.5">
                    {recap.map((row) => (
                      <li key={row.slug}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium">
                            {label(row.slug, row.interest)}
                            {row.github && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">GitHub</span>}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground tabular">{Math.round(row.weight * 100)} %</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
                          <motion.div
                            className="h-full origin-left rounded-full bg-brand"
                            initial={{ scaleX: m.reduced ? row.weight : 0 }}
                            animate={{ scaleX: row.weight }}
                            transition={m.reduced ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 text-[0.8125rem] text-muted-foreground">
                    {t('step3.levelLine')} <span className="font-medium text-foreground">{t(`common:levels.${level}`)}</span>
                  </p>
                </section>
                <ul className="flex flex-col gap-5 self-center">
                  {(
                    [
                      { key: 'explain', icon: Eye },
                      { key: 'steer', icon: SlidersHorizontal },
                      { key: 'explore', icon: Compass },
                    ] as const
                  ).map(({ key, icon: Icon }) => (
                    <li key={key} className="flex gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-brand">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <p className="text-sm text-muted-foreground">
                        <span className="block font-medium text-foreground">{t(`step3.points.${key}.title`)}</span>
                        {t(`step3.points.${key}.body`)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>

          {/* Actions */}
          <div className="sticky bottom-0 -mx-4 mt-10 flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-4 pb-safe sm:static sm:mx-0 sm:border-0 sm:px-0 sm:py-0">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={finish.isPending}>
                <ArrowLeft aria-hidden="true" />
                {t('common:actions.back')}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              {step === 1 && !enough && (
                <p id={`${id}-need`} className="hidden text-[0.8125rem] text-muted-foreground sm:block">
                  {t('step2.need', { count: MIN_INTERESTS - selected.length })}
                </p>
              )}
              <Button type="submit" size="lg" aria-disabled={!canNext || undefined} aria-describedby={step === 1 && !enough ? `${id}-need` : undefined} loading={finish.isPending}>
                {step === STEPS - 1 ? t('step3.cta') : t('common:actions.continue')}
                {!finish.isPending && (step === STEPS - 1 ? <Rocket aria-hidden="true" /> : <ArrowRight aria-hidden="true" />)}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
