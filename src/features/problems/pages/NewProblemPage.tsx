import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useProfile } from '@/app/auth';
import { errorMessage, interestLabel } from '@/app/i18n';
import { AiLabel, PageHeader, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, qk } from '@/lib/api';
import type { Level, PostKind, Repro, TriageResult } from '@/lib/api/contract';
import { cn } from '@/lib/utils';
import { EMPTY_REPRO, ReproEditor } from '../repro/Repro';

const LANGUAGES = ['javascript', 'typescript', 'jsx', 'tsx', 'python', 'sql', 'bash', 'java', 'php', 'go', 'css', 'html', 'json', 'yaml'];
const LEVELS: Level[] = ['beginner', 'intermediate', 'senior'];
const selectClass = 'focus-ring h-10 w-full rounded-md border border-input bg-background px-3 text-sm touch:h-11';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export default function NewProblemPage() {
  const { t, i18n } = useTranslation('problems');
  const { t: tc } = useTranslation();
  const profile = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const [kind, setKind] = React.useState<PostKind>('problem');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [code, setCode] = React.useState('');
  const [language, setLanguage] = React.useState('javascript');
  const [tags, setTags] = React.useState<string[]>([]);
  const [difficulty, setDifficulty] = React.useState<Level>(profile.level);
  const [circleId, setCircleId] = React.useState('');
  const [repro, setRepro] = React.useState<Repro | null>(null);
  const [triage, setTriage] = React.useState<TriageResult | null>(null);
  const [keepAi, setKeepAi] = React.useState(true);
  const [errors, setErrors] = React.useState<{ title?: string; tags?: string }>({});
  const titleRef = React.useRef<HTMLInputElement>(null);

  const interests = useQuery({ queryKey: qk.interests(), queryFn: () => api.interests.list(), staleTime: Infinity });
  const circles = useQuery({ queryKey: qk.circles(), queryFn: () => api.circles.list() });
  React.useEffect(() => {
    const slug = params.get('circle');
    const match = circles.data?.find((circle) => circle.slug === slug);
    if (match) setCircleId(match.id);
  }, [params, circles.data]);

  const probe = useDebounced(`${title} ${body}`.trim(), 600);
  const similar = useQuery({
    queryKey: qk.similarPosts(probe),
    queryFn: () => api.search.similar(probe, { limit: 5 }),
    enabled: title.trim().length >= 12,
    placeholderData: (previous) => previous,
  });
  const strongMatch = similar.data?.find((post) => post.status === 'solved' && (post.similarity ?? 0) >= 0.5);

  const analyse = useMutation({
    mutationFn: () => api.ai.triage({ title, bodyMd: body, code: code || null, language, locale: i18n.language === 'en' ? 'en' : 'fr' }),
    onSuccess: setTriage,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const create = useMutation({
    mutationFn: () =>
      api.posts.create({
        kind,
        title,
        bodyMd: body,
        code: code || null,
        language: code ? language : null,
        repro,
        tags,
        difficulty,
        circleId: circleId || null,
        aiSummary: triage && keepAi ? triage.summary : null,
        aiHints: triage && keepAi ? triage.hints : [],
      }),
    onSuccess: (post) => {
      toast.success(t('new.published'));
      void queryClient.invalidateQueries({ queryKey: qk.postsAll });
      navigate(`/p/${post.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const toggleTag = (slug: string) => setTags((current) => (current.includes(slug) ? current.filter((s) => s !== slug) : current.length < 5 ? [...current, slug] : current));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    const length = title.trim().length;
    if (length < 8 || length > 160) next.title = t('new.errTitle');
    if (tags.length < 1) next.tags = t('new.errTags');
    setErrors(next);
    if (next.title) titleRef.current?.focus();
    if (!next.title && !next.tags) create.mutate();
  };

  return (
    <>
      <PageHeader title={t('new.title')} description={t('new.description')} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t('new.kind')}</legend>
            <div className="inline-flex rounded-lg border border-border p-1">
              {(['problem', 'discussion'] as const).map((value) => (
                <label key={value} className={cn('cursor-pointer rounded-md px-3 py-1.5 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring', kind === value ? 'bg-surface-hover text-foreground' : 'text-muted-foreground')}>
                  <input type="radio" name="kind" className="sr-only" checked={kind === value} onChange={() => setKind(value)} />
                  {t(value === 'problem' ? 'new.kindProblem' : 'new.kindDiscussion')}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <Label htmlFor="p-title">{t('new.fieldTitle')}</Label>
            <Input
              id="p-title"
              ref={titleRef}
              className="mt-1.5"
              value={title}
              maxLength={160}
              placeholder={t('new.titlePlaceholder')}
              aria-invalid={Boolean(errors.title)}
              aria-describedby="p-title-hint"
              onChange={(event) => setTitle(event.target.value)}
            />
            <p id="p-title-hint" className={cn('mt-1.5 flex justify-between gap-3 text-xs', errors.title ? 'text-destructive' : 'text-muted-foreground')}>
              <span>{errors.title ?? t('new.titleHint')}</span>
              <span className="font-mono tabular">{title.length}/160</span>
            </p>
            {strongMatch && (
              <p role="status" className="mt-2 rounded-lg border border-brand-border bg-brand-soft p-3 text-sm">
                {t('new.similarCallout')}{' '}
                <a className="font-medium underline underline-offset-2" href={`/p/${strongMatch.id}`} target="_blank" rel="noreferrer">{strongMatch.title}</a>
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="p-body">{t('new.body')}</Label>
            <Textarea id="p-body" className="mt-1.5 min-h-40" value={body} maxLength={10000} aria-describedby="p-body-hint" onChange={(event) => setBody(event.target.value)} />
            <p id="p-body-hint" className="mt-1.5 text-xs text-muted-foreground">{t('new.bodyHint')}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <div>
              <Label htmlFor="p-code">{t('new.code')}</Label>
              <Textarea id="p-code" className="mt-1.5 min-h-28 font-mono text-[0.8125rem]" spellCheck={false} value={code} maxLength={20000} onChange={(event) => setCode(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-lang">{t('new.language')}</Label>
              <select id="p-lang" className={cn(selectClass, 'mt-1.5')} value={language} onChange={(event) => setLanguage(event.target.value)}>
                {LANGUAGES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>

          <fieldset aria-describedby="p-tags-hint">
            <legend className="text-sm font-medium">{t('new.tags')}</legend>
            <p id="p-tags-hint" className={cn('mt-1 text-xs', errors.tags ? 'text-destructive' : 'text-muted-foreground')}>{errors.tags ?? t('new.tagsHint')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {interests.data?.map((interest) => {
                const active = tags.includes(interest.slug);
                return (
                  <button
                    key={interest.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleTag(interest.slug)}
                    className={cn(
                      'focus-ring h-8 rounded-full border px-3 text-[0.8125rem] transition-colors touch:h-11',
                      active ? 'border-brand-border bg-brand-soft text-foreground' : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
                    )}
                  >
                    {interestLabel(interest, i18n.language)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="p-level">{t('new.difficulty')}</Label>
              <select id="p-level" className={cn(selectClass, 'mt-1.5')} value={difficulty} onChange={(event) => setDifficulty(event.target.value as Level)}>
                {LEVELS.map((value) => <option key={value} value={value}>{tc(`levels.${value}`)}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="p-circle">{t('new.circle')}</Label>
              <select id="p-circle" className={cn(selectClass, 'mt-1.5')} value={circleId} onChange={(event) => setCircleId(event.target.value)}>
                <option value="">{t('new.noCircle')}</option>
                {circles.data?.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
              </select>
            </div>
          </div>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium">{t('new.repro')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('new.reproHint')}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setRepro(repro ? null : EMPTY_REPRO)}>
                {repro ? t('new.removeRepro') : t('new.addRepro')}
              </Button>
            </div>
            {repro && <div className="mt-3"><ReproEditor value={repro} onChange={setRepro} /></div>}
          </section>

          <div className="sticky bottom-20 z-10 flex justify-end rounded-xl border border-border bg-surface/95 p-3 backdrop-blur lg:bottom-4">
            <Button type="submit" loading={create.isPending}>{t('new.submit')}</Button>
          </div>
        </form>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <section aria-live="polite" className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">{t('new.similarTitle')}</h2>
            {title.trim().length < 12 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('new.similarIdle')}</p>
            ) : similar.isPending ? (
              <div className="mt-3 space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : (similar.data?.length ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('new.similarNone')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border-soft">
                {similar.data!.map((post) => {
                  const percent = Math.round((post.similarity ?? 0) * 100);
                  return (
                    <li key={post.id} className="py-2.5">
                      <a href={`/p/${post.id}`} target="_blank" rel="noreferrer" className="focus-ring block rounded text-sm leading-snug hover:text-brand">{post.title}</a>
                      <div className="mt-1.5 flex items-center gap-2">
                        <StatusBadge status={post.status} />
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-border-soft" aria-hidden="true">
                          <span className="block h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
                        </span>
                        <span className="font-mono text-xs tabular text-muted-foreground">{t('new.similarClose', { percent })}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-live="polite" className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t('new.triageTitle')}</h2>
              {triage && <AiLabel variant="short" />}
            </div>
            {!triage ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('new.triageIdle')}</p>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  {triage.tags.map((slug) => {
                    const interest = interests.data?.find((item) => item.slug === slug);
                    return <span key={slug} className="rounded-full border border-border px-2 py-0.5 text-xs">{interest ? interestLabel(interest, i18n.language) : slug}</span>;
                  })}
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs">{tc(`levels.${triage.difficulty}`)}</span>
                </div>
                <div>
                  <p className="kicker">{t('new.triageSummary')}</p>
                  <p className="mt-1 text-muted-foreground">{triage.summary}</p>
                </div>
                <div>
                  <p className="kicker">{t('new.triageHints')}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">{triage.hints.map((hint, index) => <li key={index}>{hint}</li>)}</ul>
                </div>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" className="mt-0.5 accent-[var(--brand)]" checked={keepAi} onChange={(event) => setKeepAi(event.target.checked)} />
                  {t('new.triageKeep')}
                </label>
                {triage.degraded && <p className="text-xs text-muted-foreground">{t('new.triageDegraded')}</p>}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setTags(triage.tags.slice(0, 5));
                    setDifficulty(triage.difficulty);
                    toast.success(t('new.triageApplied'));
                  }}
                >
                  {t('new.triageApply')}
                </Button>
              </div>
            )}
            <Button type="button" variant="outline" size="sm" className="mt-3 w-full" disabled={title.trim().length < 8} onClick={() => analyse.mutate()} loading={analyse.isPending}>
              <Sparkles aria-hidden="true" /> {t('new.triageRun')}
            </Button>
          </section>
        </aside>
      </div>
    </>
  );
}
