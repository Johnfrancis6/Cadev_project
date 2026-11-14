import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 28" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn('h-6 w-7 text-brand', className)}>
      <path d="m10 5-8 9 8 9M22 5l8 9-8 9M19 2l-6 24" />
    </svg>
  );
}

/** devloop wordmark: mark + name + lime dot. */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-bold tracking-[-0.045em] whitespace-nowrap text-foreground', size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-3xl' : 'text-2xl', className)}>
      <LogoMark className={size === 'sm' ? 'h-5 w-6' : size === 'lg' ? 'h-7 w-8' : undefined} />
      <span>
        devloop<span className="text-brand">.</span>
      </span>
    </span>
  );
}
