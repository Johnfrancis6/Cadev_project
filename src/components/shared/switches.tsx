import { Check, Languages, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/app/i18n';
import { useTheme, type ThemePreference } from '@/app/theme';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

const THEMES: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];

export interface ThemeToggleProps {
  /** `menu`: icon button + dropdown (top bar). `segmented`: three inline choices (settings). */
  variant?: 'menu' | 'segmented';
  className?: string;
}

export function ThemeToggle({ variant = 'menu', className }: ThemeToggleProps) {
  const { t } = useTranslation();
  const { theme, resolvedTheme, setTheme } = useTheme();

  if (variant === 'segmented') {
    return (
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={theme}
        onValueChange={(value) => value && setTheme(value as ThemePreference)}
        aria-label={t('theme.label')}
        className={className}
      >
        {THEMES.map(({ value, icon: Icon }) => (
          <ToggleGroupItem key={value} value={value}>
            <Icon aria-hidden="true" />
            {t(`theme.${value}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    );
  }

  const Current = resolvedTheme === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`${t('theme.toggle')} (${t(`theme.${theme}`)})`} className={className}>
          <Current className="!size-[1.125rem]" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEMES.map(({ value, icon: Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon aria-hidden="true" />
            {t(`theme.${value}`)}
            {theme === value && <Check className="ml-auto !text-brand" aria-label="✓" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface LanguageSwitchProps {
  /** `compact`: "FR"/"EN" button that flips the language. `segmented`: both choices inline. */
  variant?: 'compact' | 'segmented';
  className?: string;
}

export function LanguageSwitch({ variant = 'compact', className }: LanguageSwitchProps) {
  const { t } = useTranslation();
  const { locale, setLocale, locales } = useLocale();

  if (variant === 'segmented') {
    return (
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={locale}
        onValueChange={(value) => value && setLocale(value as typeof locale)}
        aria-label={t('language.label')}
        className={className}
      >
        {locales.map((code) => (
          <ToggleGroupItem key={code} value={code} lang={code}>
            {t(`language.${code}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    );
  }

  const other = locale === 'fr' ? 'en' : 'fr';
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setLocale(other)}
      aria-label={t('language.switchTo', { language: t(`language.${other}`) })}
      className={cn('w-auto gap-1.5 px-2.5 font-mono text-xs font-medium uppercase', className)}
    >
      <Languages aria-hidden="true" />
      {locale}
    </Button>
  );
}
