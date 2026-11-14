import * as React from 'react';
import { cn } from '@/lib/utils';

export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-xs border border-border-strong bg-surface-soft px-1',
        'font-sans text-[0.6875rem] font-medium leading-none text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
