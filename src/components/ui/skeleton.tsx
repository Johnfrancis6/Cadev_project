import * as React from 'react';
import { cn } from '@/lib/utils';

/** Decorative placeholder. Wrap groups in an element with `role="status"` + a visually hidden label. */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('skeleton-shimmer rounded-md bg-surface-hover', className)}
      {...props}
    />
  );
}
