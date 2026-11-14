import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-surface-soft text-muted-foreground',
        outline: 'border-border bg-transparent text-muted-foreground',
        brand: 'border-brand-border bg-brand-soft text-brand',
        solid: 'border-primary bg-primary text-primary-foreground',
        warning: 'border-warning/30 bg-warning-soft text-warning',
        info: 'border-info/30 bg-info-soft text-info',
        violet: 'border-violet/30 bg-violet-soft text-violet',
        destructive: 'border-destructive/30 bg-destructive-soft text-destructive',
      },
      mono: { true: 'font-mono text-[0.6875rem] tracking-wide', false: '' },
    },
    defaultVariants: { variant: 'neutral', mono: false },
  },
);

export interface BadgeProps extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

export function Badge({ className, variant, mono, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'span';
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant, mono }), className)} {...props} />;
}
