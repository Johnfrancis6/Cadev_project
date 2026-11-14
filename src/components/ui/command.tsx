import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';
import { VisuallyHidden } from './visually-hidden';

export function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn('flex size-full flex-col overflow-hidden rounded-xl bg-raised text-foreground', className)}
      {...props}
    />
  );
}

export interface CommandDialogProps extends React.ComponentProps<typeof Dialog> {
  /** Accessible title and description (visually hidden). */
  title: string;
  description?: string;
  closeLabel?: string;
  /** Forwarded to cmdk; set `false` when results are already filtered by the server. */
  shouldFilter?: boolean;
  className?: string;
}

export function CommandDialog({ title, description, closeLabel, shouldFilter, className, children, ...props }: CommandDialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent
        hideClose
        closeLabel={closeLabel}
        className={cn('top-[12vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:top-[18vh]', className)}
      >
        <VisuallyHidden>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? title}</DialogDescription>
        </VisuallyHidden>
        <Command shouldFilter={shouldFilter}>{children}</Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4" data-slot="command-input-wrapper">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'h-13 w-full bg-transparent text-[0.9375rem] outline-none placeholder:text-faint disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('max-h-[min(24rem,50dvh)] overflow-x-hidden overflow-y-auto overscroll-contain p-1.5', className)}
      {...props}
    />
  );
}

export function CommandEmpty({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className={cn('px-4 py-8 text-center text-sm text-muted-foreground', className)} {...props} />;
}

export function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint',
        className,
      )}
      {...props}
    />
  );
}

export function CommandSeparator({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator className={cn('-mx-1.5 my-1 h-px bg-border', className)} {...props} />;
}

export function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        'relative flex min-h-10 cursor-default items-center gap-3 rounded-md px-2.5 py-2 text-sm outline-none select-none touch:min-h-11',
        'data-[selected=true]:bg-surface-hover data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 [&_svg:not([class*=text-])]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function CommandShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('ml-auto font-mono text-xs text-faint', className)} {...props} />;
}

export function CommandLoading({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Loading>) {
  return <CommandPrimitive.Loading className={cn('px-4 py-6 text-center text-sm text-muted-foreground', className)} {...props} />;
}
