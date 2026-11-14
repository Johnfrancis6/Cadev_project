import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer touch-target inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-input bg-surface-hover p-0.5',
        'transition-colors duration-150 focus-ring disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-[1.125rem] rounded-full bg-muted-foreground transition-transform duration-150 ease-out',
          'data-[state=checked]:translate-x-5 data-[state=checked]:bg-primary-foreground',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
