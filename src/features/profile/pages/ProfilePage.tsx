import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/app/i18n';
import { usePageTitle } from '@/app/layout';
import { EmptyState, LevelBadge, PageSkeleton, PostCard, StatNumber, TagChip, UserAvatar } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { api, qk } from '@/lib/api';

export default function ProfilePage() {
  const { handle = '' } = useParams();
  const { t } = useTranslation('profile');
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: qk.profile(handle), queryFn: () => api.profiles.get(handle), retry: false });
  const userId = detail.data?.profile.id;
  const posts = useInfiniteQuery({
    queryKey: qk.userPosts(userId ?? ''),
    queryFn: ({ pageParam }) => api.profiles.posts(userId!, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(userId),
  });
  const follow = useMutation({
    mutationFn: (next: boolean) => api.profiles.setFollowing(userId!, next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.profile(handle) });
      void queryClient.invalidateQueries({ queryKey: qk.feedAll });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  usePageTitle(detail.data?.profile.displayName);

  if (detail.isPending) return <PageSkeleton />;
  if (detail.isError) return <EmptyState title={t('profile.notFound')} description="" action={<Button asChild><Link to="/feed">{t('profile.back')}</Link></Button>} />;
  const { profile, stats, interests, viewer } = detail.data;
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
  const tiles: [string, string | number][] = [
    [t('profile.unblockedTotal'), stats.unblockedTotal],
    [t('profile.unblockRate'), `${Math.round(stats.unblockRate * 100)} %`],
    [t('profile.answers'), stats.answersGiven],
    [t('profile.asked'), `${stats.problemsAsked} · ${stats.problemsSolved} ${t('profile.solved')}`],
    [t('profile.helpful'), stats.helpfulReceived],
    [t('profile.followers'), stats.followers],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <header className="flex flex-wrap items-start gap-5">
        <UserAvatar user={profile} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{profile.displayName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            @{profile.handle} <LevelBadge level={profile.level} /> <span>{t('profile.reputation', { count: profile.reputation })}</span>
          </p>
          {profile.bio && <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed">{profile.bio}</p>}
        </div>
        {viewer.isSelf ? (
          <Button asChild variant="outline"><Link to="/settings">{t('profile.edit')}</Link></Button>
        ) : (
          <Button variant={viewer.isFollowing ? 'outline' : 'default'} aria-pressed={viewer.isFollowing} onClick={() => follow.mutate(!viewer.isFollowing)} loading={follow.isPending}>
            {viewer.isFollowing ? t('profile.following') : t('profile.follow')}
          </Button>
        )}
      </header>

      <section className="mt-8 rounded-xl border border-brand-border bg-brand-soft p-5">
        <p className="font-mono text-4xl font-semibold tabular"><StatNumber value={stats.unblockedThisWeek} /></p>
        <p className="mt-1 text-sm text-muted-foreground">{t('profile.unblockedWeek')}</p>
      </section>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-mono text-lg font-medium tabular">{value}</dd>
          </div>
        ))}
      </dl>

      {interests.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">{t('profile.interests')}</h2>
          <ul className="flex flex-wrap gap-2">{interests.map((tag) => <li key={tag.id}><TagChip tag={tag} /></li>)}</ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">{t('profile.posts')}</h2>
        {posts.isSuccess && items.length === 0 && <p className="text-sm text-muted-foreground">{t('profile.noPosts')}</p>}
        <div className="flex flex-col gap-4">{items.map((post) => <PostCard key={post.id} post={post} hideCode headingLevel={3} />)}</div>
        {posts.hasNextPage && (
          <Button variant="secondary" className="mx-auto mt-5 flex" onClick={() => void posts.fetchNextPage()} loading={posts.isFetchingNextPage}>{t('profile.loadMore')}</Button>
        )}
      </section>
    </div>
  );
}
