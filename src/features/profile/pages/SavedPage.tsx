import { useQuery } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState, ErrorState, PageHeader, PostCard, PostListSkeleton } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { api, qk } from '@/lib/api';

export default function SavedPage() {
  const { t } = useTranslation('profile');
  const saved = useQuery({ queryKey: qk.savedPosts(), queryFn: () => api.posts.saved(), select: (page) => page.items });
  return (
    <>
      <PageHeader title={t('saved.title')} description={t('saved.description')} />
      {saved.isPending ? (
        <PostListSkeleton />
      ) : saved.isError ? (
        <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />
      ) : saved.data.length === 0 ? (
        <EmptyState icon={Bookmark} title={t('saved.empty')} description={t('saved.emptyHint')} action={<Button asChild><Link to="/feed">{t('saved.toFeed')}</Link></Button>} />
      ) : (
        <div className="flex flex-col gap-4">{saved.data.map((post) => <PostCard key={post.id} post={post} hideCode />)}</div>
      )}
    </>
  );
}
