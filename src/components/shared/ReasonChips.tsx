import { Compass, Flame, Gauge, Heart, MessageCircleQuestion, Sparkle, UserCheck, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FeedReason, FeedReasonKind, Interest } from '@/lib/api/contract';
import { interestLabel } from '@/app/i18n';
import { cn } from '@/lib/utils';

const ICONS: Record<FeedReasonKind, LucideIcon> = {
  interest: Heart,
  level: Gauge,
  trending: Flame,
  explore: Compass,
  fresh: Sparkle,
  following: UserCheck,
  unanswered: MessageCircleQuestion,
};

export interface ReasonChipsProps {
  reasons: FeedReason[] | undefined;
  /** The post's tags, used to print a localised topic name instead of the slug. */
  tags?: Interest[];
  /** The post's circle name, for the "trending" chip. */
  circleName?: string | null;
  className?: string;
}

/** "Why am I seeing this" chips for a feed card. Renders nothing when there is no reason. */
export function ReasonChips({ reasons, tags, circleName, className }: ReasonChipsProps) {
  const { t, i18n } = useTranslation();
  if (!reasons || reasons.length === 0) return null;

  const topicOf = (slug?: string) => {
    if (!slug) return null;
    const tag = tags?.find((x) => x.slug === slug);
    return tag ? interestLabel(tag, i18n.language) : slug;
  };

  const label = (reason: FeedReason): string => {
    const topic = topicOf(reason.interestSlug);
    switch (reason.kind) {
      case 'interest':
        if (!topic) return t('reasons.interestGeneric');
        return reason.count && reason.count > 0 ? t('reasons.interestCount', { count: reason.count, topic }) : t('reasons.interest', { topic });
      case 'explore':
        return topic ? t('reasons.exploreTopic', { topic }) : t('reasons.explore');
      case 'trending': {
        const circle = circleName ?? reason.circleSlug;
        return circle ? t('reasons.trending', { circle }) : t('reasons.trendingGeneric');
      }
      default:
        return t(`reasons.${reason.kind}`);
    }
  };

  return (
    <ul aria-label={t('reasons.title')} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {reasons.map((reason, index) => {
        const Icon = ICONS[reason.kind];
        return (
          <li
            key={`${reason.kind}-${index}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs leading-5',
              reason.kind === 'explore' ? 'border-violet/30 bg-violet-soft text-violet' : 'border-brand-border bg-brand-soft text-brand',
            )}
          >
            <Icon className="size-3 shrink-0" aria-hidden="true" />
            {label(reason)}
          </li>
        );
      })}
    </ul>
  );
}
