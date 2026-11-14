import { FlaskConical, X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiInfo } from '@/lib/api';

const KEY = 'devloop.demo-banner.dismissed';

/** Slim notice shown while the app runs on in-browser data. Dismissed for the browser session. */
export function DemoBanner() {
  const { t } = useTranslation();
  const [hidden, setHidden] = React.useState(() => {
    try {
      return sessionStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (api.mode !== 'local' || hidden) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b border-border-soft bg-surface-soft py-1 pr-1 pl-4 text-xs text-muted-foreground">
      <FlaskConical className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
      <span className="min-w-0 truncate">{apiInfo.fellBack ? t('app.fallbackBanner') : t('app.demoBanner')}</span>
      <button
        type="button"
        aria-label={t('app.demoBannerDismiss')}
        onClick={() => {
          try {
            sessionStorage.setItem(KEY, '1');
          } catch {
            /* ignore */
          }
          setHidden(true);
        }}
        className="touch-target inline-flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-surface-hover hover:text-foreground focus-ring"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
