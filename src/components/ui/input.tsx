import * as React from 'react';
import { cn } from '@/lib/utils';

export const fieldClasses = [
  'w-full min-w-0 rounded-md border border-input bg-surface px-3 text-[0.9375rem] text-foreground',
  'placeholder:text-faint transition-[border-color,box-shadow] duration-150',
  'hover:border-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive',
].join(' ');

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(fieldClasses, 'h-10 touch:h-11', className)} {...props} />;
}
