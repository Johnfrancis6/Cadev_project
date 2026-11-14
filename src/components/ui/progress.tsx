import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-surface-hover', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full origin-left rounded-full bg-brand transition-transform duration-300 ease-out"
        style={{ transform: `scaleX(${Math.min(100, Math.max(0, value ?? 0)) / 100})` }}
      />
    </ProgressPrimitive.Root>
  );
}
