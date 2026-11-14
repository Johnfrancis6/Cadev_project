import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "il y a 24 min" / "24 min. ago". Pure, exported for tests and non-React use. */
export function formatRelativeTime(date: string | number | Date, locale: string, nowLabel: string, now = Date.now()): string {
  const seconds = Math.round((new Date(date).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (!Number.isFinite(seconds)) return '';
  if (abs < 45) return nowLabel;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  for (const [unit, size] of UNITS) {
    if (abs >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(Math.sign(seconds) || -1, 'minute');
}

// One shared ticker for every <RelativeTime> on screen.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => listeners.forEach((l) => l()), 30_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const getTick = () => Math.floor(Date.now() / 30_000);

export interface RelativeTimeProps {
  date: string | number | Date;
  className?: string;
}

/** Localised relative time that refreshes itself; the exact date is in `title` and `dateTime`. */
export function RelativeTime({ date, className }: RelativeTimeProps) {
  const { t, i18n } = useTranslation();
  React.useSyncExternalStore(subscribe, getTick, getTick);
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  const absolute = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeStyle: 'short' }).format(value);
  return (
    <time dateTime={value.toISOString()} title={absolute} className={cn('whitespace-nowrap', className)}>
      {formatRelativeTime(value, i18n.language, t('time.now'))}
    </time>
  );
}
