import { Bookmark, MessageSquare, ThumbsUp } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '@/lib/api';
import type { Post } from '@/lib/api/contract';
import { cn, formatCount } from '@/lib/utils';
import { AiLabel, LevelBadge, StatusBadge, TagChip } from './badges';
import { CodeBlock } from './CodeBlock';
import { usePostActions } from './post-cache';
import { ReasonChips } from './ReasonChips';
import { RelativeTime } from './RelativeTime';
import { UserAvatar } from './UserAvatar';

export interface PostCardProps {
  post: Post;
  /** Called when the card's title link is activated (e.g. to record an `open` event). */
  onOpen?: (post: Post) => void;
  /** Show the "why am I seeing this" chips from `post.reasons`. */
  showReasons?: boolean;
  /** Extra row under the counters (e.g. feed "less of this" control). */
  footer?: React.ReactNode;
  /** Hide the collapsed code preview. */
  hideCode?: boolean;
  /** Heading level of the title (default h2; use h3 inside a titled section). */
  headingLevel?: 2 | 3;
  className?: string;
}

const actionClasses =
  'relative z-10 inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-xs text-muted-foreground tabular transition-colors hover:bg-surface-hover hover:text-foreground focus-ring touch:h-11 touch:px-3 [&_svg]:size-4';

export function PostCard({ post: input, onOpen, showReasons = false, footer, hideCode = false, headingLevel = 2, className }: PostCardProps) {
  const { t, i18n } = useTranslation();
  const { post, toggleHelpful, toggleSaved } = usePostActions(input);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const hasReasons = showReasons && (post.reasons?.length ?? 0) > 0;

  return (
    <article
      data-slot="post-card"
      data-post-id={post.id}
      className={cn(
        'group/post relative flex flex-col gap-3.5 rounded-xl border border-border bg-surface p-4 sm:p-5',
        'transition-[border-color,transform] duration-200 ease-out hover:border-border-strong motion-safe:hover:-translate-y-0.5',
        'has-[[data-post-link]:focus-visible]:border-ring',
        className,
      )}
    >
      {hasReasons && <ReasonChips reasons={post.reasons} tags={post.tags} circleName={post.circle?.name} />}

      <div className="flex items-center gap-3">
        <Link
          to={`/u/${post.author.handle}`}
          aria-label={t('post.byAuthor', { name: post.author.displayName })}
          className="relative z-10 shrink-0 rounded-full focus-ring"
        >
          <UserAvatar user={post.author} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link to={`/u/${post.author.handle}`} className="relative z-10 truncate rounded-xs text-sm font-semibold hover:underline focus-ring">
              {post.author.displayName}
            </Link>
            <LevelBadge level={post.author.level} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <RelativeTime date={post.createdAt} />
            {post.circle && (
              <>
                <span aria-hidden="true"> · </span>
                <Link to={`/c/${post.circle.slug}`} className="relative z-10 rounded-xs hover:text-foreground hover:underline focus-ring">
                  {t('post.inCircle', { circle: post.circle.name })}
                </Link>
              </>
            )}
          </p>
        </div>
        <StatusBadge status={post.status} className="shrink-0 self-start" />
      </div>

      <div className="flex flex-col gap-2">
        <Heading className="text-[1.0625rem] leading-snug font-semibold tracking-tight">
          <Link
            to={`/p/${post.id}`}
            data-post-link=""
            onClick={() => onOpen?.(post)}
            className="outline-none after:absolute after:inset-0 after:rounded-xl group-hover/post:text-brand"
          >
            {post.title}
          </Link>
        </Heading>
        {post.aiSummary && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            <AiLabel variant="short" className="mr-2 align-[0.1em]" />
            {post.aiSummary}
          </p>
        )}
      </div>

      {post.code && !hideCode && (
        <CodeBlock
          code={post.code}
          language={post.language}
          maxLines={6}
          onCopy={() => api.feed.recordEvent(post.id, 'copy_code')}
          onExpand={() => api.feed.recordEvent(post.id, 'expand_code')}
        />
      )}

      {post.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {post.tags.map((tag) => (
            <li key={tag.id}>
              <TagChip tag={tag} />
            </li>
          ))}
        </ul>
      )}

      <div className="-mx-2 -mb-1.5 flex items-center gap-1">
        <span className={cn(actionClasses, 'pointer-events-none')}>
          <MessageSquare aria-hidden="true" />
          <span aria-hidden="true">{formatCount(post.answerCount, i18n.language)}</span>
          <span className="sr-only">{t('post.answers', { count: post.answerCount })}</span>
        </span>
        <button
          type="button"
          onClick={toggleHelpful}
          aria-pressed={post.viewer.helpful}
          aria-label={`${post.viewer.helpful ? t('actions.unmarkHelpful') : t('actions.markHelpful')} (${post.helpfulCount})`}
          className={cn(actionClasses, post.viewer.helpful && 'text-brand hover:text-brand')}
        >
          <ThumbsUp aria-hidden="true" className={cn('transition-transform', post.viewer.helpful && 'fill-brand-soft motion-safe:scale-110')} />
          <span aria-hidden="true">{formatCount(post.helpfulCount, i18n.language)}</span>
          <span aria-hidden="true" className="font-sans max-sm:hidden">{t('actions.helpful')}</span>
        </button>
        <button
          type="button"
          onClick={toggleSaved}
          aria-pressed={post.viewer.saved}
          aria-label={post.viewer.saved ? t('actions.unsave') : t('actions.saveToFavorites')}
          className={cn(actionClasses, 'ml-auto', post.viewer.saved && 'text-brand hover:text-brand')}
        >
          <Bookmark aria-hidden="true" className={cn(post.viewer.saved && 'fill-current')} />
          <span aria-hidden="true" className="font-sans max-sm:hidden">{post.viewer.saved ? t('actions.saved') : t('actions.save')}</span>
        </button>
      </div>

      {footer && <div className="relative z-10 border-t border-border-soft pt-3">{footer}</div>}
    </article>
  );
}
