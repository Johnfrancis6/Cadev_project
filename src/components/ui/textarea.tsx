import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldClasses } from './input';

export function Textarea({ className, rows = 4, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      data-slot="textarea"
      className={cn(fieldClasses, 'min-h-20 resize-y py-2.5 leading-relaxed', className)}
      {...props}
    />
  );
}
