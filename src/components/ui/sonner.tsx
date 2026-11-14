import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/app/theme';

/** Toast region (aria-live handled by sonner). Fire toasts with `toast()` from 'sonner'. */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme}
      position="bottom-right"
      offset={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))', right: '1rem' }}
      mobileOffset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      toastOptions={{
        classNames: {
          toast: '!rounded-xl !border-border-strong !bg-raised !text-foreground !shadow-pop !font-sans !text-sm',
          description: '!text-muted-foreground',
          actionButton: '!bg-primary !text-primary-foreground !font-semibold',
          cancelButton: '!bg-surface-hover !text-foreground',
          success: '[&_[data-icon]]:!text-brand',
          error: '[&_[data-icon]]:!text-destructive',
        },
      }}
      {...props}
    />
  );
}
