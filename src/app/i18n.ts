/**
 * i18n bootstrap. French by default, English available.
 *
 * Namespaces:
 *   - `common`            → src/app/locales/{fr,en}.json (nav, actions, levels, statuses, reasons, errors, time…)
 *   - `<feature folder>`  → src/features/<name>/locales/{fr,en}.json, registered automatically.
 *
 * In a feature: `const { t } = useTranslation('feed')` then `t('title')`; common strings with
 * `t('common:actions.save')` or a second hook `useTranslation()` (default namespace = common).
 */
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import type { ApiErrorCode, Interest, Locale } from '@/lib/api/contract';
import { safeStorage } from '@/lib/utils';

export const LOCALES: readonly Locale[] = ['fr', 'en'];
export const DEFAULT_LOCALE: Locale = 'fr';
const STORAGE_KEY = 'devloop.lang'; // also read by public/theme.js

type Dict = Record<string, unknown>;
const commonFiles = import.meta.glob<Dict>('./locales/*.json', { eager: true, import: 'default' });
const featureFiles = import.meta.glob<Dict>('../features/*/locales/*.json', { eager: true, import: 'default' });

const resources: Record<string, Record<string, Dict>> = { fr: {}, en: {} };
for (const [path, dict] of Object.entries(commonFiles)) {
  const lang = /\/(fr|en)\.json$/.exec(path)?.[1];
  if (lang) resources[lang]!.common = dict;
}
for (const [path, dict] of Object.entries(featureFiles)) {
  const match = /\/features\/([^/]+)\/locales\/(fr|en)\.json$/.exec(path);
  if (match) resources[match[2]!]![match[1]!] = dict;
}

export function detectLocale(): Locale {
  const stored = safeStorage.get(STORAGE_KEY);
  if (stored === 'fr' || stored === 'en') return stored;
  const nav = typeof navigator !== 'undefined' ? navigator.languages?.[0] ?? navigator.language : '';
  if (nav?.toLowerCase().startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}

const syncHtmlLang = (lang: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
};

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: LOCALES as string[],
  defaultNS: 'common',
  fallbackNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});
syncHtmlLang(i18n.language);
i18n.on('languageChanged', syncHtmlLang);

export function currentLocale(): Locale {
  return i18n.language?.startsWith('en') ? 'en' : 'fr';
}

export function setLocale(locale: Locale): void {
  safeStorage.set(STORAGE_KEY, locale);
  void i18n.changeLanguage(locale);
}

/** Localised label of an interest/tag. */
export function interestLabel(interest: Pick<Interest, 'labelFr' | 'labelEn'>, lang: Locale | string): string {
  return lang.startsWith('en') ? interest.labelEn : interest.labelFr;
}

/** Translated message for an `ApiError` (or any thrown value). */
export function errorMessage(error: unknown): string {
  const code = (error as { code?: ApiErrorCode } | null)?.code;
  return i18n.t(`common:errors.${code ?? 'unknown'}`, { defaultValue: i18n.t('common:errors.unknown') });
}

/** Current UI language + setter. Re-renders on language change. */
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void; locales: readonly Locale[] } {
  const { i18n: instance } = useTranslation();
  const locale: Locale = instance.language?.startsWith('en') ? 'en' : 'fr';
  return { locale, setLocale, locales: LOCALES };
}

export default i18n;
