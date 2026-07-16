import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from '@/data/locales';

export const APP_LOCALES = ['zh-CN', 'en-US'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

const DEFAULT_LOCALE: AppLocale = 'zh-CN';
const LOCALE_STORAGE_KEY = 'softdesk-locale';

function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (APP_LOCALES as readonly string[]).includes(value);
}

function getInitialLocale(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isAppLocale(saved) ? saved : DEFAULT_LOCALE;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLocale(),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: APP_LOCALES,
  interpolation: { escapeValue: false },
});

export async function setAppLocale(locale: AppLocale): Promise<void> {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  await i18n.changeLanguage(locale);
}

export default i18n;
