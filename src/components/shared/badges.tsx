import { CheckCircle2, CircleDashed, Hash, Sparkles } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { interestLabel } from '@/app/i18n';
import { Badge } from '@/components/ui/badge';
import type { Interest, Level, PostStatus } from '@/lib/api/contract';
import { cn } from '@/lib/utils';

const LEVEL_VARIANT = { beginner: 'info', intermediate: 'warning', senior: 'violet' } as const;

export interface LevelBadgeProps {
  level: Level;
  className?: string;
}

export function LevelBadge({ level, className }: LevelBadgeProps) {
  const { t } = useTranslation();
  return (
    <Badge variant={LEVEL_VARIANT[level]} mono className={cn('px-2 py-0 uppercase', className)}>
      <span className="sr-only">{t('levels.label', { level: '' })}</span>
      {t(`levels.${level}`)}
    </Badge>
  );
}

export interface StatusBadgeProps {
  status: PostStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation();
  const solved = status === 'solved';
  const Icon = solved ? CheckCircle2 : CircleDashed;
  return (
    <Badge variant={solved ? 'brand' : 'neutral'} className={className}>
      <Icon aria-hidden="true" />
      {t(`status.${status}`)}
    </Badge>
  );
}

export interface TagChipProps {
  /** A full interest (label is localised) or a bare slug. */
  tag: Interest | string;
  /** Link target; omit for a static chip. */
  to?: string;
  onClick?: (event: React.MouseEvent) => void;
  active?: boolean;
  className?: string;
}

export function TagChip({ tag, to, onClick, active = false, className }: TagChipProps) {
  const { i18n } = useTranslation();
  const label = typeof tag === 'string' ? tag : interestLabel(tag, i18n.language);
  const classes = cn(
    'relative inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors',
    active ? 'bg-brand-soft text-brand' : 'bg-surface-soft',
    (to || onClick) && 'touch-target focus-ring hover:bg-brand-soft hover:text-brand',
    className,
  );
  const content = (
    <>
      <Hash className="size-3 opacity-70" aria-hidden="true" />
      {label}
    </>
  );
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={classes}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={classes}>
        {content}
      </button>
    );
  }
  return <span className={classes}>{content}</span>;
}

export interface AiLabelProps {
  /** `full`: "Généré par IA"; `short`: "IA". */
  variant?: 'full' | 'short';
  /** Override the text (e.g. "Résumé IA"). */
  children?: React.ReactNode;
  className?: string;
}

/** The marker that must accompany every AI-generated content. */
export function AiLabel({ variant = 'full', children, className }: AiLabelProps) {
  const { t } = useTranslation();
  return (
    <Badge variant="violet" mono className={cn('px-2 py-0 uppercase', className)} title={t('ai.hint')}>
      <Sparkles aria-hidden="true" className="!size-3" />
      {children ?? (variant === 'short' ? <abbr title={t('ai.label')} className="no-underline">{t('ai.short')}</abbr> : t('ai.label'))}
    </Badge>
  );
}
