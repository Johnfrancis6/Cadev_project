import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleHelp, Plus, SlidersHorizontal, ThumbsDown } from 'lucide-react';
import { motion } from 'motion/react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useProfile } from '@/app/auth';
import { interestLabel } from '@/app/i18n';
import { RightRail } from '@/app/layout';
import { useMotionPresets } from '@/app/motion';
import { EmptyState, ErrorState, PageHeader, PostCard, PostListSkeleton, StatNumber, UserAvatar } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api, qk } from '@/lib/api';
import type { FeedReason, FeedTab, Post, UserInterest } from '@/lib/api/contract';
import { cn } from '@/lib/utils';
import { TuneSheet } from '../components/TuneSheet';

const TABS: FeedTab[] = ['for-you', 'following', 'unanswered', 'latest'];
const seenImpressions = new Set<string>();

export default function FeedPage() {
  const { t, i18n } = useTranslation('feed');
  const profile = useProfile();
  const m = useMotionPresets();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as FeedTab) ? params.get('tab') : 'for-you') as FeedTab;
  const topic = params.get('topic');
  const tuneOpen = params.get('tune') === '1';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const interests = useQuery({ queryKey: qk.myInterests(), queryFn: () => api.interests.mine() });
  const stats = useQuery({ queryKey: qk.platformStats(), queryFn: () => api.stats.platform() });
  const feed = useInfiniteQuery({
    queryKey: qk.feed(tab, topic),
    queryFn: ({ pageParam }) => api.feed.list({ tab, interestSlug: topic, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchOnMount: 'always',
  });
  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];

  // "Your feed adapted": compare the top interest with the one seen last time.
  const [adapted, setAdapted] = React.useState<string | null>(null);
  const top = interests.data?.find((row) => !row.muted);
  React.useEffect(() => {
    if (!top) return;
    const key = `devloop.feed.top.${profile.id}`;
    let previous: string | null = null;
    try {
      previous = sessionStorage.getItem(key);
      sessionStorage.setItem(key, top.interest.slug);
    } catch {
      /* storage unavailable */
    }
    if (previous && previous !== top.interest.slug) setAdapted(interestLabel(top.interest, i18n.language));
  }, [top, profile.id, i18n.language]);

  const less = (post: Post) => {
    api.feed.recordEvent(post.id, 'less');
    const topics = post.tags.map((tag) => interestLabel(tag, i18n.language)).join(', ');
    toast(topics ? t('less.toast', { topics }) : t('less.toastGeneric'), { description: t('less.toastHint') });
    void queryClient.invalidateQueries({ queryKey: qk.myInterests() });
    void queryClient.invalidateQueries({ queryKey: qk.feedAll });
  };

  const firstName = profile.displayName.split(' ')[0];

  return (
    <>
      <PageHeader
        kicker={
          stats.data && (
            <>
              <StatNumber value={stats.data.unblockedThisWeek} /> {t('header.unblocked', { count: stats.data.unblockedThisWeek })}
            </>
          )
        }
        title={t('header.greeting', { name: firstName })}
        actions={
          <>
            <Button variant="outline" onClick={() => setParam('tune', '1')}>
              <SlidersHorizontal aria-hidden="true" />
              {t('header.tune')}
            </Button>
            <Button asChild>
              <Link to="/p/new">
                <Plus aria-hidden="true" />
                {t('header.ask')}
              </Link>
            </Button>
          </>
        }
      />

      <div role="tablist" aria-label={t('tabs.label')} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {TABS.map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => setParam('tab', value === 'for-you' ? null : value)}
            className={cn(
              'focus-ring relative h-11 shrink-0 rounded-t-md px-3 text-sm font-medium transition-colors',
              tab === value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`tabs.${value}`)}
            {tab === value && <motion.span layoutId="feed-tab" transition={m.layout} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      {(interests.data?.length ?? 0) > 0 && (
        <div role="group" aria-label={t('topics.label')} className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TopicChip active={!topic} onClick={() => setParam('topic', null)}>
            {t('topics.all')}
          </TopicChip>
          {interests.data!
            .filter((row) => !row.muted)
            .slice(0, 8)
            .map((row) => (
              <TopicChip key={row.interest.id} active={topic === row.interest.slug} onClick={() => setParam('topic', topic === row.interest.slug ? null : row.interest.slug)}>
                {interestLabel(row.interest, i18n.language)}
              </TopicChip>
            ))}
        </div>
      )}

      <div aria-live="polite" className="mt-4">
        {adapted && tab === 'for-you' && (
          <motion.p {...m.fadeUp} className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-brand-border bg-brand-soft px-3.5 py-2.5 text-sm">
            {t('adapt.more', { topic: adapted })}
            <button type="button" className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAdapted(null)}>
              {t('adapt.dismiss')}
            </button>
          </motion.p>
        )}
      </div>

      <section aria-label={t('list.label')} aria-busy={feed.isFetching}>
        {feed.isPending ? (
          <PostListSkeleton />
        ) : feed.isError ? (
          <ErrorState error={feed.error} onRetry={() => void feed.refetch()} retrying={feed.isFetching} />
        ) : posts.length === 0 ? (
          topic ? (
            <EmptyState
              title={t('empty.topic.title', { topic })}
              description={t('empty.topic.hint')}
              action={<Button variant="secondary" onClick={() => setParam('topic', null)}>{t('empty.topic.action')}</Button>}
            />
          ) : (
            <EmptyState
              title={t(`empty.${tab}.title`)}
              description={t(`empty.${tab}.hint`)}
              action={
                tab === 'for-you' ? (
                  <Button variant="secondary" onClick={() => setParam('tune', '1')}>{t('empty.for-you.action')}</Button>
                ) : tab === 'latest' ? (
                  <Button asChild><Link to="/p/new">{t('empty.latest.action')}</Link></Button>
                ) : (
                  <Button variant="secondary" onClick={() => setParam('tab', tab === 'following' ? null : 'latest')}>{t(`empty.${tab}.action`)}</Button>
                )
              }
            />
          )
        ) : (
          <motion.ul {...m.list} className="flex flex-col gap-4">
            {posts.map((post) => (
              <motion.li key={post.id} variants={m.item} layout={!m.reduced} transition={m.layout}>
                <Impression postId={post.id}>
                  <PostCard
                    post={post}
                    showReasons={tab === 'for-you'}
                    footer={tab === 'for-you' ? <WhyPopover post={post} interests={interests.data ?? []} onLess={() => less(post)} onTune={() => setParam('tune', '1')} /> : undefined}
                  />
                </Impression>
              </motion.li>
            ))}
          </motion.ul>
        )}
        {feed.hasNextPage && (
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" onClick={() => void feed.fetchNextPage()} loading={feed.isFetchingNextPage}>
              {feed.isFetchingNextPage ? t('list.loadingMore') : t('list.loadMore')}
            </Button>
          </div>
        )}
        {!feed.hasNextPage && posts.length > 0 && <p className="mt-8 text-center text-sm text-muted-foreground">{t('list.end')}</p>}
      </section>

      <RightRail>
        <Rail interests={interests.data ?? []} onTune={() => setParam('tune', '1')} />
      </RightRail>
      <TuneSheet open={tuneOpen} onOpenChange={(open) => setParam('tune', open ? '1' : null)} />
    </>
  );
}

function TopicChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'focus-ring h-8 shrink-0 rounded-full border px-3 text-[0.8125rem] transition-colors touch:h-11',
        active ? 'border-brand-border bg-brand-soft text-foreground' : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** Records one `impression` when the card stays at least half visible for a second. */
function Impression({ postId, children }: { postId: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const node = ref.current;
    if (!node || seenImpressions.has(postId) || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !timer) {
          timer = setTimeout(() => {
            seenImpressions.add(postId);
            api.feed.recordEvent(postId, 'impression');
            observer.disconnect();
          }, 1000);
        } else if (!entry.isIntersecting && timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [postId]);
  return <div ref={ref}>{children}</div>;
}

function WhyPopover({ post, interests, onLess, onTune }: { post: Post; interests: UserInterest[]; onLess: () => void; onTune: () => void }) {
  const { t, i18n } = useTranslation('feed');
  const explain = (reason: FeedReason): string => {
    const tag = post.tags.find((item) => item.slug === reason.interestSlug);
    const topic = tag ? interestLabel(tag, i18n.language) : undefined;
    switch (reason.kind) {
      case 'interest': {
        if (!topic) return t('why.interestGeneric');
        if (reason.count) return t('why.interestCount', { count: reason.count, topic });
        const row = interests.find((item) => item.interest.slug === reason.interestSlug);
        return row ? t('why.interestWeight', { topic, percent: Math.round(row.weight * 100) }) : t('why.interest', { topic });
      }
      case 'explore':
        return topic ? t('why.exploreTopic', { topic }) : t('why.explore');
      case 'trending':
        return post.circle ? t('why.trending', { circle: post.circle.name }) : t('why.trendingGeneric');
      default:
        return t(`why.${reason.kind}`);
    }
  };
  const reasons = post.reasons ?? [];
  return (
    <div className="relative z-10 flex flex-wrap items-center gap-x-1 gap-y-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <CircleHelp aria-hidden="true" />
            {t('why.trigger')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
          <p className="text-sm font-semibold">{t('why.title')}</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
            {reasons.length ? reasons.map((reason, index) => <li key={index}>{explain(reason)}</li>) : <li>{t('why.none')}</li>}
          </ul>
          <Button variant="link" size="sm" className="mt-3" onClick={onTune}>
            {t('why.tune')}
          </Button>
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="sm" className="text-muted-foreground" title={t('why.lessHint')} aria-label={t('less.actionFor', { title: post.title })} onClick={onLess}>
        <ThumbsDown aria-hidden="true" />
        {t('less.action')}
      </Button>
    </div>
  );
}

function Rail({ interests, onTune }: { interests: UserInterest[]; onTune: () => void }) {
  const { t, i18n } = useTranslation('feed');
  const queryClient = useQueryClient();
  const unanswered = useQuery({ queryKey: qk.feed('unanswered', null), queryFn: () => api.feed.list({ tab: 'unanswered', limit: 3 }), select: (page) => page.items.slice(0, 3) });
  const people = useQuery({ queryKey: qk.suggestions(3), queryFn: () => api.profiles.suggestions(3) });
  const [followed, setFollowed] = React.useState<Set<string>>(new Set());
  const top = interests.filter((row) => !row.muted).slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="rail-interests" className="rounded-xl border border-border bg-surface p-4">
        <h2 id="rail-interests" className="text-sm font-semibold">{t('rail.interests')}</h2>
        {top.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t('rail.interestsEmpty')}</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {top.map((row) => {
              const percent = Math.round(row.weight * 100);
              return (
                <li key={row.interest.id} aria-label={t('rail.interestWeight', { topic: interestLabel(row.interest, i18n.language), percent })}>
                  <div className="flex justify-between text-xs">
                    <span>{interestLabel(row.interest, i18n.language)}</span>
                    <span className="font-mono tabular text-muted-foreground">{percent} %</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-border-soft">
                    <motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: `${percent}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Button variant="outline" size="sm" className="mt-4 w-full" onClick={onTune}>
          <SlidersHorizontal aria-hidden="true" />
          {t('header.tune')}
        </Button>
      </section>

      <section aria-labelledby="rail-unanswered">
        <div className="flex items-baseline justify-between">
          <h2 id="rail-unanswered" className="text-sm font-semibold">{t('rail.unanswered')}</h2>
          <Link to="/feed?tab=unanswered" className="focus-ring rounded text-xs text-muted-foreground hover:text-foreground">{t('rail.unansweredAll')}</Link>
        </div>
        {unanswered.data?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{t('rail.unansweredEmpty')}</p>}
        <ul className="mt-2 divide-y divide-border-soft">
          {unanswered.data?.map((post) => (
            <li key={post.id}>
              <Link to={`/p/${post.id}`} className="focus-ring block rounded py-2.5 text-sm leading-snug hover:text-brand">{post.title}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rail-people">
        <h2 id="rail-people" className="text-sm font-semibold">{t('rail.people')}</h2>
        {people.data?.length === 0 && <p className="mt-2 text-sm text-muted-foreground">{t('rail.peopleEmpty')}</p>}
        <ul className="mt-2 space-y-3">
          {people.data?.map((person) => {
            const isFollowed = followed.has(person.id);
            return (
              <li key={person.id} className="flex items-center gap-3">
                <UserAvatar user={person} size="sm" />
                <Link to={`/u/${person.handle}`} className="focus-ring min-w-0 flex-1 truncate rounded text-sm hover:text-brand">{person.displayName}</Link>
                <Button
                  variant={isFollowed ? 'ghost' : 'outline'}
                  size="sm"
                  aria-pressed={isFollowed}
                  aria-label={t(isFollowed ? 'rail.unfollowName' : 'rail.followName', { name: person.displayName })}
                  onClick={() => {
                    const next = new Set(followed);
                    if (isFollowed) next.delete(person.id);
                    else next.add(person.id);
                    setFollowed(next);
                    void api.profiles.setFollowing(person.id, !isFollowed).then(() => queryClient.invalidateQueries({ queryKey: qk.feedAll }));
                    if (!isFollowed) toast.success(t('rail.followed', { name: person.displayName }));
                  }}
                >
                  {isFollowed ? '✓' : <Plus aria-hidden="true" />}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
