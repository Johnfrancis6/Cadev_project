import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold',
    'transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out select-none',
    'focus-ring disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45',
    'motion-safe:active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  ],
  {
    variants: {
      variant: {
        default:
          'border border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover motion-safe:hover:-translate-y-px',
        secondary:
          'border border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-hover motion-safe:hover:-translate-y-px',
        outline: 'border border-border bg-transparent text-foreground hover:border-border-strong hover:bg-surface-hover',
        subtle: 'border border-brand-border bg-brand-soft text-brand hover:bg-brand-soft/80 hover:border-brand',
        ghost: 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
        destructive:
          'border border-destructive bg-destructive text-destructive-foreground hover:opacity-90 motion-safe:hover:-translate-y-px',
        'destructive-ghost': 'text-destructive hover:bg-destructive-soft',
        link: 'h-auto min-h-0 rounded-sm px-0 font-medium text-brand underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-[0.8125rem] touch:min-h-11',
        default: 'h-10 px-4 touch:min-h-11',
        lg: 'h-12 px-6 text-[0.9375rem]',
        icon: 'size-10 touch:size-11',
        'icon-sm': 'size-8 touch:size-11',
      },
    },
    compoundVariants: [{ variant: 'link', class: 'h-auto px-0 touch:min-h-0' }],
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

export function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...(asChild ? {} : { type: props.type ?? 'button' })}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
          {children}
        </>
      )}
    </Comp>
  );
}
