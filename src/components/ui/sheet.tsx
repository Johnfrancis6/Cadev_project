import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

const sheetVariants = cva('fixed z-50 flex flex-col gap-4 border-border bg-raised p-6 text-foreground shadow-pop', {
  variants: {
    side: {
      right:
        'inset-y-0 right-0 h-full w-[min(26rem,calc(100vw-3rem))] border-l data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
      left: 'inset-y-0 left-0 h-full w-[min(22rem,calc(100vw-3rem))] border-r data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left',
      bottom:
        'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:animate-slide-in-bottom data-[state=closed]:animate-slide-out-bottom',
      top: 'inset-x-0 top-0 max-h-[85dvh] rounded-b-2xl border-b data-[state=open]:animate-slide-in-top data-[state=closed]:animate-slide-out-top',
    },
  },
  defaultVariants: { side: 'right' },
});

export interface SheetContentProps
  extends React.ComponentProps<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  closeLabel?: string;
  hideClose?: boolean;
}

export function SheetContent({ side, className, children, closeLabel = 'Fermer', hideClose = false, ...props }: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
      <SheetPrimitive.Content data-slot="sheet-content" className={cn(sheetVariants({ side }), 'overflow-y-auto', className)} {...props}>
        {children}
        {!hideClose && (
          <SheetPrimitive.Close
            aria-label={closeLabel}
            className="touch-target absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1.5 pr-8', className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn('text-lg font-semibold leading-snug', className)} {...props} />;
}

export function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
