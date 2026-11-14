import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small mono label above the title. */
  kicker?: React.ReactNode;
  /** Right-aligned actions (buttons). */
  actions?: React.ReactNode;
  className?: string;
}

/** Page title block. Renders the page's single <h1>. */
export function PageHeader({ title, description, kicker, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0">
        {kicker && <p className="kicker mb-2">{kicker}</p>}
        <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[0.9375rem] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export interface SectionProps extends Omit<React.ComponentProps<'section'>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned element next to the title (link, button). */
  action?: React.ReactNode;
  /** Heading level of the title (default 2). */
  level?: 2 | 3;
}

/** Titled region; labelled by its heading for assistive tech. */
export function Section({ title, description, action, level = 2, className, children, ...props }: SectionProps) {
  const id = React.useId();
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section aria-labelledby={title ? id : undefined} className={cn('flex flex-col gap-4', className)} {...props}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <Heading id={id} className={cn('font-semibold', level === 2 ? 'text-lg' : 'text-base')}>
                {title}
              </Heading>
            )}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
