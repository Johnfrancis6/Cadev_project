import * as SliderPrimitive from '@radix-ui/react-slider';
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
  /** Accessible name for each thumb (one per value). */
  thumbLabels?: string[];
}

export function Slider({ className, defaultValue, value, thumbLabels, ...props }: SliderProps) {
  const count = (value ?? defaultValue ?? [0]).length;
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      className={cn(
        'relative flex h-6 w-full touch-none items-center select-none touch:h-11 data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-hover">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-brand" />
      </SliderPrimitive.Track>
      {Array.from({ length: count }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={thumbLabels?.[i] ?? props['aria-label']}
          aria-labelledby={props['aria-labelledby']}
          className={cn(
            'touch-target block size-5 rounded-full border-2 border-brand bg-background shadow-sm',
            'transition-transform duration-150 focus-ring motion-safe:hover:scale-110 motion-safe:active:scale-110',
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}
