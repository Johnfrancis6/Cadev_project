import { ArrowRight, Check, Eye, EyeOff, Zap } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useAuth } from '@/app/auth';
import { errorMessage } from '@/app/i18n';
import { Logo } from '@/app/layout';
import { LanguageSwitch, ThemeToggle } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import type { ApiErrorCode } from '@/lib/api/contract';
import { cn } from '@/lib/utils';

type Mode = 'signin' | 'signup';
type Field = 'displayName' | 'email' | 'password';
type Pending = 'guest' | 'github' | 'email' | null;

const signInSchema = z.object({
  email: z.string().trim().min(1, 'emailRequired').pipe(z.email('emailInvalid')),
  password: z.string().min(1, 'passwordRequired'),
});
const signUpSchema = z.object({
  displayName: z.string().trim().min(2, 'nameShort').max(40, 'nameLong'),
  email: z.string().trim().min(1, 'emailRequired').pipe(z.email('emailInvalid')),
  password: z.string().min(8, 'passwordShort').max(72, 'passwordLong'),
});

/** Only same-site paths: a single leading slash, no scheme-relative or backslash tricks. */
function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if (value === '/auth' || value.startsWith('/auth?')) return null;
  return value;
}

/** 0 = too short, 1 = weak, 2 = fair, 3 = strong. */
function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length < 8) return 0;
  let variety = 0;
  if (/[a-z]/.test(password)) variety += 1;
  if (/[A-Z]/.test(password)) variety += 1;
  if (/\d/.test(password)) variety += 1;
  if (/[^A-Za-z0-9]/.test(password)) variety += 1;
  if (password.length >= 12 && variety >= 3) return 3;
  if (password.length >= 10 && variety >= 2) return 2;
  if (variety >= 3) return 2;
  return 1;
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export default function AuthPage() {
  const { t } = useTranslation('auth');
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get('mode') === 'signup' ? 'signup' : 'signin';
  const next = safeNext(params.get('next'));

  const [values, setValues] = React.useState<Record<Field, string>>({ displayName: '', email: '', password: '' });
  const [errors, setErrors] = React.useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [pending, setPending] = React.useState<Pending>(null);
  const id = React.useId();
  const refs = { displayName: React.useRef<HTMLInputElement>(null), email: React.useRef<HTMLInputElement>(null), password: React.useRef<HTMLInputElement>(null) };

  // The PublicOnly guard redirects to `location.state.from` once a session exists: hand it `?next=`.
  const stateFrom = (location.state as { from?: string } | null)?.from;
  React.useEffect(() => {
    if (next && stateFrom !== next) navigate(location.pathname + location.search, { replace: true, state: { from: next } });
  }, [next, stateFrom, navigate, location.pathname, location.search]);

  const setMode = (value: string) => {
    const copy = new URLSearchParams(params);
    if (value === 'signup') copy.set('mode', 'signup');
    else copy.delete('mode');
    setParams(copy, { replace: true, state: location.state });
    setErrors({});
    setFormError(null);
  };

  const set = (field: Field) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: event.target.value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const fail = (error: unknown, context: 'email' | 'other') => {
    const code = (error as { code?: ApiErrorCode } | null)?.code;
    if (context === 'email' && (code === 'unauthenticated' || code === 'forbidden' || code === 'not_found' || code === 'validation')) {
      setFormError(t(mode === 'signin' ? 'errors.credentials' : 'errors.signup'));
    } else if (code === 'conflict') setFormError(t('errors.conflict'));
    else if (code === 'rate_limited') setFormError(t('errors.rateLimited'));
    else setFormError(errorMessage(error));
  };

  const run = async (kind: Exclude<Pending, null>, action: () => Promise<unknown>) => {
    if (pending) return;
    setPending(kind);
    setFormError(null);
    try {
      await action();
      // Guards redirect as soon as the session is known; make sure it is.
      if (kind !== 'github') await refresh();
    } catch (error) {
      fail(error, kind === 'email' ? 'email' : 'other');
    } finally {
      setPending(null);
    }
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = mode === 'signup' ? signUpSchema.safeParse(values) : signInSchema.safeParse(values);
    if (!parsed.success) {
      const found: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        found[field] ??= issue.message;
      }
      setErrors(found);
      const first = (['displayName', 'email', 'password'] as const).find((f) => found[f]);
      if (first) refs[first].current?.focus();
      return;
    }
    setErrors({});
    const data = parsed.data;
    void run('email', () =>
      'displayName' in data
        ? api.auth.signUpEmail({ email: data.email, password: data.password, displayName: data.displayName })
        : api.auth.signInEmail({ email: data.email, password: data.password }),
    );
  };

  const strength = passwordStrength(values.password);
  const strengthKey = (['short', 'weak', 'fair', 'strong'] as const)[strength];
  const errorId = (field: Field) => `${id}-${field}-error`;
  const fieldError = (field: Field) =>
    errors[field] ? (
      <p id={errorId(field)} className="text-[0.8125rem] text-destructive">
        {t(`validation.${errors[field]}`)}
      </p>
    ) : null;

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Brand panel */}
      <aside aria-label={t('brand.label')} className="relative hidden overflow-hidden border-r border-border bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" aria-hidden="true" />
        <Link to="/" aria-label={t('common:nav.home')} className="relative self-start rounded-md focus-ring">
          <Logo size="lg" />
        </Link>
        <div className="relative flex flex-col gap-8">
          <img src="/hero-art.svg" alt="" width={390} height={280} className="h-auto w-full max-w-sm self-center" />
          <div>
            <p className="text-4xl leading-[1.1] font-semibold tracking-tight xl:text-5xl">
              {t('brand.taglineA')}
              <br />
              <span className="text-brand">{t('brand.taglineB')}</span>
            </p>
            <ul className="mt-8 flex flex-col gap-3.5">
              {(['explain', 'solved', 'repro'] as const).map((key) => (
                <li key={key} className="flex items-start gap-3 text-[0.9375rem] text-muted-foreground">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-brand-border bg-brand-soft text-brand">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                  {t(`brand.promises.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="kicker relative">{t('brand.foot')}</p>
      </aside>

      {/* Form side */}
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link to="/" aria-label={t('common:nav.home')} className="rounded-md focus-ring lg:invisible">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-1">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-[26.5rem] flex-1 flex-col justify-center px-4 pt-4 pb-12 outline-none sm:px-0">
          <p className="mb-2 text-sm font-medium text-brand lg:hidden">{t('common:app.tagline')}</p>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">{t(mode === 'signup' ? 'titleSignup' : 'title')}</h1>
          <p className="mt-2 text-[0.9375rem] text-muted-foreground">{t('subtitle')}</p>

          {/* Guest: the fast path */}
          <section aria-labelledby={`${id}-guest`} className="mt-7 rounded-xl border border-brand-border bg-brand-soft p-4 sm:p-5">
            <h2 id={`${id}-guest`} className="flex items-center gap-2 text-[0.9375rem] font-semibold">
              <Zap className="size-4 text-brand" aria-hidden="true" />
              {t('guest.title')}
            </h2>
            <p id={`${id}-guest-hint`} className="mt-1.5 text-sm text-muted-foreground">
              {t('guest.hint')}
            </p>
            <Button
              size="lg"
              className="mt-4 w-full"
              loading={pending === 'guest'}
              disabled={pending !== null}
              aria-describedby={`${id}-guest-hint`}
              onClick={() => void run('guest', () => api.auth.signInGuest())}
            >
              {t('guest.cta')}
              {pending !== 'guest' && <ArrowRight aria-hidden="true" />}
            </Button>
          </section>

          <Button
            variant="secondary"
            size="lg"
            className="mt-3 w-full"
            loading={pending === 'github'}
            disabled={pending !== null}
            onClick={() => void run('github', () => api.auth.signInGithub())}
          >
            {pending !== 'github' && <GithubMark className="size-[1.125rem]" />}
            {t('github')}
          </Button>

          <div className="my-6 flex items-center gap-3" role="presentation">
            <span className="h-px flex-1 bg-border" />
            <span className="kicker">{t('orEmail')}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs variant="pill" value={mode} onValueChange={setMode} className="gap-5">
            <TabsList className="w-full" aria-label={t('modeLabel')}>
              <TabsTrigger value="signin" className="flex-1">
                {t('tabs.signin')}
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                {t('tabs.signup')}
              </TabsTrigger>
            </TabsList>

            <form noValidate onSubmit={onSubmit} aria-label={t(mode === 'signup' ? 'tabs.signup' : 'tabs.signin')} className="flex flex-col gap-4">
              <div role="alert" aria-live="assertive" className={cn(formError ? 'rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2.5 text-sm text-destructive' : 'sr-only')}>
                {formError}
              </div>

              {mode === 'signup' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${id}-name`}>{t('fields.displayName')}</Label>
                  <Input
                    ref={refs.displayName}
                    id={`${id}-name`}
                    name="name"
                    autoComplete="name"
                    value={values.displayName}
                    onChange={set('displayName')}
                    maxLength={40}
                    aria-invalid={errors.displayName ? true : undefined}
                    aria-describedby={errors.displayName ? errorId('displayName') : undefined}
                  />
                  {fieldError('displayName')}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-email`}>{t('fields.email')}</Label>
                <Input
                  ref={refs.email}
                  id={`${id}-email`}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete={mode === 'signup' ? 'email' : 'username'}
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={t('fields.emailPlaceholder')}
                  value={values.email}
                  onChange={set('email')}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? errorId('email') : undefined}
                />
                {fieldError('email')}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-password`}>{t('fields.password')}</Label>
                <div className="relative">
                  <Input
                    ref={refs.password}
                    id={`${id}-password`}
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={values.password}
                    onChange={set('password')}
                    className="pr-12"
                    aria-invalid={errors.password ? true : undefined}
                    aria-describedby={cn(errors.password && errorId('password'), mode === 'signup' && `${id}-password-hint`) || undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={t(showPassword ? 'fields.hidePassword' : 'fields.showPassword')}
                    aria-pressed={showPassword}
                    className="touch-target absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-ring"
                  >
                    {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                  </button>
                </div>
                {fieldError('password')}
                {mode === 'signup' && (
                  <div id={`${id}-password-hint`} className="flex items-center gap-3 text-[0.8125rem] text-muted-foreground">
                    <span className="flex gap-1" aria-hidden="true">
                      {[1, 2, 3].map((step) => (
                        <span
                          key={step}
                          className={cn(
                            'h-1 w-7 rounded-full transition-colors',
                            strength >= step ? (strength === 1 ? 'bg-warning' : 'bg-brand') : 'bg-border-strong',
                          )}
                        />
                      ))}
                    </span>
                    <span aria-live="polite">{values.password ? t(`strength.${strengthKey}`) : t('strength.hint')}</span>
                  </div>
                )}
              </div>

              <Button type="submit" size="lg" variant="secondary" className="mt-1 w-full" loading={pending === 'email'} disabled={pending !== null}>
                {t(mode === 'signup' ? 'submit.signup' : 'submit.signin')}
              </Button>
            </form>
          </Tabs>

          <p className="mt-6 text-center text-[0.8125rem] text-faint">{t('privacy')}</p>
        </main>
      </div>
    </div>
  );
}
