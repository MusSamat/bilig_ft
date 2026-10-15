/**
 * UI localization (ky/ru/en). Only interface strings live here — all CONTENT
 * (subjects, topics, concepts) is localized in the content package itself via
 * the content-model `Localized` type (TZ W-01: "новый язык = новые файлы локалей").
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ky from './locales/ky.json';
import ru from './locales/ru.json';
import en from './locales/en.json';
import { DEFAULT_LANG } from '@bilig/content-model';

export const UI_LANGS = ['ky', 'ru', 'en'] as const;

void i18n.use(initReactI18next).init({
  resources: {
    ky: { translation: ky },
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: localStorage.getItem('bilig.lang') ?? DEFAULT_LANG,
  fallbackLng: ['ru', 'en', 'ky'],
  interpolation: { escapeValue: false },
});

export default i18n;
