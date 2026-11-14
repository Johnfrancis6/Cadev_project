import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, ErrorState, PageHeader, PostCard, PostListSkeleton, UserAvatar } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, qk } from '@/lib/api';
import type { PostStatus } from '@/lib/api/contract';
import { cn } from '@/lib/utils';

export default function SearchPage() {
  const { t } = useTranslation('search');
  const [params, setParams] = useSearchParams();
  const [input, setInput] = React.useState(params.get('q') ?? '');
  const [status, setStatus] = React.useState<PostStatus | null>(null);
  const query = (params.get('q') ?? '').trim();

  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (input.trim() !== query) setParams(input.trim() ? { q: input.trim() } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [input, query, setParams]);

  const enabled = query.length >= 2;
  const posts = useQuery({ queryKey: qk.searchPosts(query, status), queryFn: () => api.search.posts(query, { status: status ?? undefined }), enabled });
  const people = useQuery({ queryKey: qk.searchPeople(query), queryFn: () => api.search.people(query, 5), enabled });

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input autoFocus type="search" aria-label={t('label')} placeholder={t('placeholder')} className="h-12 pl-10 text-base" value={input} onChange={(event) => setInput(event.target.value)} />
      </div>
      <div role="group" aria-label={t('filter')} className="mt-4 flex gap-2">
        {([null, 'solved', 'open'] as const).map((value) => (
          <button
            key={value ?? 'all'}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={cn('focus-ring h-8 rounded-full border px-3 text-[0.8125rem] touch:h-11', status === value ? 'border-brand-border bg-brand-soft' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            {t(value ?? 'all')}
          </button>
        ))}
      </div>

      <div className="mt-6" aria-live="polite">
        {!enabled ? (
          <p className="text-sm text-muted-foreground">{t('idle')}</p>
        ) : posts.isPending ? (
          <PostListSkeleton />
        ) : posts.isError ? (
          <ErrorState error={posts.error} onRetry={() => void posts.refetch()} />
        ) : (
          <>
            {(people.data?.length ?? 0) > 0 && (
              <section className="mb-6">
                <h2 className="mb-2 text-sm font-semibold">{t('people')}</h2>
                <ul className="flex flex-wrap gap-2">
                  {people.data!.map((person) => (
                    <li key={person.id}>
                      <Link to={`/u/${person.handle}`} className="focus-ring flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 text-sm hover:border-border-strong">
                        <UserAvatar user={person} size="sm" />
                        {person.displayName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {posts.data.length === 0 ? (
              <EmptyState title={t('none', { query })} description={t('noneHint')} action={<Button asChild><Link to="/p/new">{t('ask')}</Link></Button>} />
            ) : (
              <>
                <p className="mb-3 font-mono text-xs text-muted-foreground">{t('count', { count: posts.data.length })}</p>
                <div className="flex flex-col gap-4">{posts.data.map((post) => <PostCard key={post.id} post={post} hideCode />)}</div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
