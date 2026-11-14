import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const toggleVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap text-muted-foreground',
    'transition-colors duration-150 focus-ring hover:bg-surface-hover hover:text-foreground',
    'disabled:pointer-events-none disabled:opacity-50',
    'data-[state=on]:bg-brand-soft data-[state=on]:text-brand',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  ],
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-border data-[state=on]:border-brand-border',
      },
      size: {
        sm: 'h-8 min-w-8 px-2.5 touch:min-h-11 touch:min-w-11',
        default: 'h-10 min-w-10 px-3 touch:min-h-11 touch:min-w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return <TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant, size }), className)} {...props} />;
}
