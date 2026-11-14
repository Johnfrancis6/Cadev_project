import { CircleAlert, Inbox, RotateCw, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/app/i18n';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Usually a <Button>. */
  action?: React.ReactNode;
  /** `dashed` (default, standalone) or `plain` (inside a card). */
  variant?: 'dashed' | 'plain';
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, variant = 'dashed', className }: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center px-6 py-14 text-center',
        variant === 'dashed' && 'rounded-xl border border-dashed border-border-strong',
        className,
      )}
    >
      <span className="mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-surface text-brand">
        <Icon className="size-5" strokeWidth={1.6} aria-hidden="true" />
      </span>
      <p className="text-base font-semibold text-foreground">{title ?? t('states.emptyTitle')}</p>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description ?? t('states.emptyHint')}</p>
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  /** The thrown value; an `ApiError` code is translated automatically. */
  error?: unknown;
  title?: React.ReactNode;
  description?: React.ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

export function ErrorState({ error, title, description, onRetry, retrying = false, className }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn('flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive-soft px-6 py-12 text-center', className)}
    >
      <span className="mb-4 flex size-12 items-center justify-center rounded-full border border-destructive/30 bg-surface text-destructive">
        <CircleAlert className="size-5" strokeWidth={1.6} aria-hidden="true" />
      </span>
      <p className="text-base font-semibold text-foreground">{title ?? t('states.errorTitle')}</p>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description ?? (error ? errorMessage(error) : t('states.errorHint'))}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry} loading={retrying}>
          {!retrying && <RotateCw aria-hidden="true" />}
          {t('actions.retry')}
        </Button>
      )}
    </div>
  );
}
