import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.ComponentProps<'div'> {
  /** Adds the subtle hover lift used by clickable cards. */
  interactive?: boolean;
}

export function Card({ className, interactive = false, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-xl border border-border bg-surface text-foreground',
        interactive &&
          'transition-[border-color,transform,box-shadow] duration-200 ease-out hover:border-border-strong motion-safe:hover:-translate-y-0.5',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex flex-col gap-1.5 p-5 pb-0 sm:p-6 sm:pb-0', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 data-slot="card-title" className={cn('text-base font-semibold leading-snug', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('p-5 sm:p-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-3 border-t border-border-soft px-5 py-3.5 sm:px-6', className)}
      {...props}
    />
  );
}
