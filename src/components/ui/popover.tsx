import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 8,
  collisionPadding = 12,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'z-50 w-72 max-w-[calc(100vw-1.5rem)] origin-(--radix-popover-content-transform-origin) rounded-xl border border-border bg-raised p-4 text-foreground shadow-pop outline-none',
          'data-[state=open]:animate-scale-in data-[state=closed]:animate-fade-out',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
