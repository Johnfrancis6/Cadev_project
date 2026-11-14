import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ApiErrorCode } from '@/lib/api/contract';
import { AuthProvider } from './auth';
import i18n from './i18n';
import { ThemeProvider } from './theme';

const NO_RETRY: ApiErrorCode[] = ['unauthenticated', 'forbidden', 'not_found', 'validation', 'conflict', 'rate_limited'];

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const code = (error as { code?: ApiErrorCode } | null)?.code;
          if (code && NO_RETRY.includes(code)) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      },
      mutations: { retry: false },
    },
  });
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(createQueryClient);
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <MotionConfig reducedMotion="user">
            <TooltipProvider>
              <AuthProvider>{children}</AuthProvider>
              <Toaster />
            </TooltipProvider>
          </MotionConfig>
        </QueryClientProvider>
      </ThemeProvider>
    </I18nextProvider>
  );
}
