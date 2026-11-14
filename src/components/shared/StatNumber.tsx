import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface StatNumberProps {
  value: number;
  /** Intl.NumberFormat options (e.g. `{ style: 'percent' }`). */
  format?: Intl.NumberFormatOptions;
  /** Count-up duration in ms (default 900). */
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/** Number that counts up the first time it scrolls into view. Static under reduced motion. */
export function StatNumber({ value, format, duration = 900, prefix = '', suffix = '', className }: StatNumberProps) {
  const { i18n } = useTranslation();
  const reduced = useReducedMotion();
  const ref = React.useRef<HTMLSpanElement>(null);
  const [shown, setShown] = React.useState(reduced ? value : 0);
  const from = React.useRef(0);

  React.useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    const run = () => {
      const start = performance.now();
      const origin = from.current;
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - p) ** 3;
        const next = origin + (value - origin) * eased;
        setShown(next);
        if (p < 1) frame = requestAnimationFrame(step);
        else from.current = value;
      };
      frame = requestAnimationFrame(step);
    };
    if (typeof IntersectionObserver === 'undefined') {
      run();
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        run();
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration, reduced]);

  const fractionDigits = format?.style === 'percent' ? undefined : Number.isInteger(value) ? 0 : undefined;
  const formatter = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: fractionDigits, ...format });
  const display = format?.style === 'percent' ? shown : Number.isInteger(value) ? Math.round(shown) : shown;
  return (
    <span ref={ref} className={cn('font-mono tabular', className)}>
      <span aria-hidden="true">
        {prefix}
        {formatter.format(display)}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {formatter.format(value)}
        {suffix}
      </span>
    </span>
  );
}
