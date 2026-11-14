import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Check, GitFork, Link2, Sparkles, ThumbsUp, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useProfile } from '@/app/auth';
import { errorMessage } from '@/app/i18n';
import { RightRail, usePageTitle } from '@/app/layout';
import { useMotionPresets } from '@/app/motion';
import { AiLabel, CodeBlock, EmptyState, ErrorState, LevelBadge, Markdown, PageSkeleton, RelativeTime, StatusBadge, TagChip, usePostActions, UserAvatar } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api, qk } from '@/lib/api';
import type { Answer, Locale, Post, Repro } from '@/lib/api/contract';
import { cn } from '@/lib/utils';
import { ReproEditor, ReproRunner } from '../repro/Repro';

export default function ProblemPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('problems');
  const query = useQuery({ queryKey: qk.post(id), queryFn: () => api.posts.get(id), retry: false });
  usePageTitle(query.data?.title);

  // Signals: one `open`, then `dwell` after 10 s of visible time.
  React.useEffect(() => {
    if (!query.data) return;
    api.feed.recordEvent(id, 'open');
    let visible = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      visible += 1;
      if (visible === 10) {
        api.feed.recordEvent(id, 'dwell', 10);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [id, Boolean(query.data)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (query.isPending) return <PageSkeleton />;
  if (query.isError) {
    const notFound = (query.error as { code?: string }).code === 'not_found';
    return notFound ? (
      <EmptyState title={t('detail.notFound')} description="" action={<Button asChild><Link to="/feed">{t('detail.backToFeed')}</Link></Button>} />
    ) : (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  return <ProblemView post={query.data} />;
}

function ProblemView({ post: input }: { post: Post }) {
  const { t, i18n } = useTranslation('problems');
  const profile = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const m = useMotionPresets();
  const { post, toggleHelpful, toggleSaved } = usePostActions(input);
  const answers = useQuery({ queryKey: qk.answers(post.id), queryFn: () => api.answers.list(post.id) });
  const similar = useQuery({
    queryKey: qk.similarPosts(post.title),
    queryFn: () => api.search.similar(post.title, { limit: 5 }),
    select: (items) => items.filter((item) => item.id !== post.id).slice(0, 4),
  });
  const isAuthor = post.author.id === profile.id;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.answers(post.id) });
    void queryClient.invalidateQueries({ queryKey: qk.postsAll });
  };
  const accept = useMutation({
    mutationFn: (answer: Answer) => api.answers.accept(answer.id),
    onSuccess: (_, answer) => {
      if (!answer.isAccepted) toast.success(t('detail.acceptedToast'));
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const helpful = useMutation({
    mutationFn: (answer: Answer) => api.answers.setHelpful(answer.id, !answer.viewer.helpful),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api.posts.remove(post.id),
    onSuccess: () => {
      toast.success(t('detail.deleted'));
      void queryClient.invalidateQueries({ queryKey: qk.postsAll });
      navigate('/feed');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('detail.shared'));
    } catch {
      toast(window.location.href);
    }
  };

  return (
    <motion.article {...m.fadeUp} className="mx-auto max-w-3xl">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={post.status} />
          <LevelBadge level={post.difficulty} />
          {post.circle && (
            <Link to={`/c/${post.circle.slug}`} className="focus-ring rounded text-sm text-muted-foreground hover:text-foreground">
              {t('detail.in', { circle: post.circle.name })}
            </Link>
          )}
        </div>
        <h1 className="mt-3 text-2xl leading-tight font-semibold tracking-tight sm:text-[1.75rem]">{post.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Link to={`/u/${post.author.handle}`} className="focus-ring flex items-center gap-2 rounded text-foreground">
            <UserAvatar user={post.author} size="sm" />
            {post.author.displayName}
          </Link>
          <span aria-hidden="true">·</span>
          <RelativeTime date={post.createdAt} />
          <span aria-hidden="true">·</span>
          <span>{t('detail.views', { count: post.viewCount })}</span>
        </div>
        <ul className="mt-4 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <li key={tag.id}><TagChip tag={tag} to={`/feed?topic=${tag.slug}`} /></li>
          ))}
        </ul>
      </header>

      {(post.aiSummary || post.aiHints.length > 0) && (
        <section className="mt-6 rounded-xl border border-violet/25 bg-violet-soft p-4">
          <AiLabel />
          {post.aiSummary && <p className="mt-2 text-[0.9375rem] leading-relaxed">{post.aiSummary}</p>}
          {post.aiHints.length > 0 && (
            <>
              <h2 className="mt-3 text-sm font-semibold">{t('detail.aiHints')}</h2>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {post.aiHints.map((hint, index) => <li key={index}>{hint}</li>)}
              </ul>
            </>
          )}
        </section>
      )}

      <div className="mt-6"><Markdown>{post.bodyMd}</Markdown></div>
      {post.code && (
        <CodeBlock
          className="mt-5"
          code={post.code}
          language={post.language}
          maxLines={30}
          onCopy={() => api.feed.recordEvent(post.id, 'copy_code')}
          onExpand={() => api.feed.recordEvent(post.id, 'expand_code')}
        />
      )}
      {post.repro && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">{t('detail.reproTitle')}</h2>
          <ReproRunner repro={post.repro} onRun={() => api.feed.recordEvent(post.id, 'run_repro')} />
        </section>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-y border-border-soft py-3">
        <Button variant={post.viewer.helpful ? 'secondary' : 'outline'} size="sm" aria-pressed={post.viewer.helpful} onClick={toggleHelpful}>
          <ThumbsUp aria-hidden="true" /> {t('detail.helpful')} · {post.helpfulCount}
        </Button>
        <Button variant={post.viewer.saved ? 'secondary' : 'outline'} size="sm" aria-pressed={post.viewer.saved} onClick={toggleSaved}>
          <Bookmark aria-hidden="true" /> {post.viewer.saved ? t('detail.saved') : t('detail.save')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void share()}>
          <Link2 aria-hidden="true" /> {t('detail.share')}
        </Button>
        {isAuthor && (
          <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => remove.mutate()} loading={remove.isPending}>
            <Trash2 aria-hidden="true" /> {t('detail.delete')}
          </Button>
        )}
      </div>

      <section className="mt-8" aria-live="polite">
        <h2 className="text-lg font-semibold">{t('detail.answers', { count: answers.data?.length ?? post.answerCount })}</h2>
        {answers.data?.length === 0 && <p className="mt-1 text-sm text-muted-foreground">{t('detail.noAnswers')}</p>}
        <ul className="mt-4 flex flex-col gap-4">
          {answers.data?.map((answer) => (
            <li
              key={answer.id}
              className={cn('rounded-xl border bg-surface p-4 sm:p-5', answer.isAccepted ? 'border-brand-border' : 'border-border')}
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link to={`/u/${answer.author.handle}`} className="focus-ring flex items-center gap-2 rounded font-medium">
                  <UserAvatar user={answer.author} size="sm" />
                  {answer.author.displayName}
                </Link>
                <LevelBadge level={answer.author.level} />
                <span className="text-muted-foreground"><RelativeTime date={answer.createdAt} /></span>
                {answer.isAi && <AiLabel variant="short" />}
                {answer.isAccepted && (
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-brand-border bg-brand-soft px-2.5 py-1 text-xs font-medium">
                    <Check className="size-3.5" aria-hidden="true" /> {t('detail.accepted')}
                  </span>
                )}
              </div>
              <div className="mt-3"><Markdown>{answer.bodyMd}</Markdown></div>
              {answer.repro && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold">{t('detail.fixedRepro')}</p>
                  <ReproRunner repro={answer.repro} />
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant={answer.viewer.helpful ? 'secondary' : 'outline'} size="sm" aria-pressed={answer.viewer.helpful} onClick={() => helpful.mutate(answer)}>
                  <ThumbsUp aria-hidden="true" /> {t('detail.helpful')} · {answer.helpfulCount}
                </Button>
                {isAuthor && (
                  <Button variant={answer.isAccepted ? 'ghost' : 'default'} size="sm" onClick={() => accept.mutate(answer)} loading={accept.isPending && accept.variables?.id === answer.id}>
                    <Check aria-hidden="true" /> {answer.isAccepted ? t('detail.unaccept') : t('detail.accept')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <AnswerComposer post={post} locale={i18n.language === 'en' ? 'en' : 'fr'} onSent={refresh} />

      <RightRail>
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="text-sm font-semibold">{t('detail.author')}</h2>
            <Link to={`/u/${post.author.handle}`} className="focus-ring mt-2 flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-border-strong">
              <UserAvatar user={post.author} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{post.author.displayName}</span>
                <span className="block text-xs text-muted-foreground">@{post.author.handle}</span>
              </span>
            </Link>
          </section>
          {(similar.data?.length ?? 0) > 0 && (
            <section>
              <h2 className="text-sm font-semibold">{t('detail.similar')}</h2>
              <ul className="mt-2 divide-y divide-border-soft">
                {similar.data!.map((item) => (
                  <li key={item.id}>
                    <Link to={`/p/${item.id}`} className="focus-ring block rounded py-2.5 text-sm leading-snug hover:text-brand">
                      {item.title}
                      <span className="mt-1 block"><StatusBadge status={item.status} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </RightRail>
    </motion.article>
  );
}

function AnswerComposer({ post, locale, onSent }: { post: Post; locale: Locale; onSent: () => void }) {
  const { t } = useTranslation('problems');
  const [body, setBody] = React.useState('');
  const [preview, setPreview] = React.useState(false);
  const [isAi, setIsAi] = React.useState(false);
  const [repro, setRepro] = React.useState<Repro | null>(null);
  const fieldId = React.useId();

  const draft = useMutation({
    mutationFn: () => api.ai.draftAnswer(post.id, locale),
    onSuccess: (result) => {
      setBody(result.answerMd);
      setIsAi(true);
      setPreview(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const send = useMutation({
    mutationFn: () => api.answers.create(post.id, { bodyMd: body, repro, isAi }),
    onSuccess: () => {
      toast.success(t('detail.sent'));
      setBody('');
      setRepro(null);
      setIsAi(false);
      onSent();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <form
      className="mt-8 rounded-xl border border-border bg-surface p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (body.trim().length >= 2) send.mutate();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={fieldId} className="text-base font-semibold">{t('detail.yourAnswer')}</label>
        <div className="flex gap-1">
          <Button type="button" variant={preview ? 'ghost' : 'secondary'} size="sm" aria-pressed={!preview} onClick={() => setPreview(false)}>{t('detail.write')}</Button>
          <Button type="button" variant={preview ? 'secondary' : 'ghost'} size="sm" aria-pressed={preview} onClick={() => setPreview(true)}>{t('detail.previewTab')}</Button>
        </div>
      </div>
      {isAi && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-violet/25 bg-violet-soft p-3 text-sm">
          <AiLabel variant="short" /> {t('detail.aiDraftNote')}
        </p>
      )}
      {preview ? (
        <div className="mt-3 min-h-32 rounded-lg border border-border-soft p-3">
          {body.trim() ? <Markdown>{body}</Markdown> : <p className="text-sm text-muted-foreground">{t('detail.previewEmpty')}</p>}
        </div>
      ) : (
        <Textarea id={fieldId} className="mt-3 min-h-32" value={body} maxLength={10000} placeholder={t('detail.answerPlaceholder')} onChange={(event) => setBody(event.target.value)} />
      )}
      {repro && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-muted-foreground">{t('detail.forkNote')}</p>
          <ReproEditor value={repro} onChange={setRepro} />
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => draft.mutate()} loading={draft.isPending}>
          <Sparkles aria-hidden="true" /> {t('detail.aiDraft')}
        </Button>
        {post.repro && (
          <Button type="button" variant="outline" size="sm" onClick={() => setRepro(repro ? null : { ...post.repro! })}>
            <GitFork aria-hidden="true" /> {repro ? t('detail.unfork') : t('detail.fork')}
          </Button>
        )}
        <Button type="submit" className="ml-auto" disabled={body.trim().length < 2} loading={send.isPending}>{t('detail.send')}</Button>
      </div>
    </form>
  );
}
