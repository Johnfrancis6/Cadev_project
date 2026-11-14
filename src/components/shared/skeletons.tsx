import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function PostCardSkeleton({ withCode = false, className }: { withCode?: boolean; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="h-5 w-4/5" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
      {withCode && <Skeleton className="h-28 w-full rounded-lg" />}
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  );
}

/** A loading list of post cards, announced once to assistive tech. */
export function PostListSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className={cn('flex flex-col gap-4', className)}>
      <span className="sr-only">{t('app.loading')}</span>
      {Array.from({ length: count }, (_, i) => (
        <PostCardSkeleton key={i} withCode={i === 0} />
      ))}
    </div>
  );
}

/** Generic rows (people, circles, notifications). */
export function ListSkeleton({ rows = 4, avatar = true, className }: { rows?: number; avatar?: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className={cn('flex flex-col gap-4', className)}>
      <span className="sr-only">{t('app.loading')}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center gap-3">
          {avatar && <Skeleton className="size-9 shrink-0 rounded-full" />}
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
            <Skeleton className="h-3" style={{ width: `${30 + ((i * 11) % 25)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Full-page placeholder used while a route chunk loads. */
export function PageSkeleton({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className={cn('flex flex-col gap-6', className)}>
      <span className="sr-only">{t('app.loading')}</span>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <PostCardSkeleton withCode />
        <PostCardSkeleton />
      </div>
    </div>
  );
}
