import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from './locales/en.json';
import ptBRTranslations from './locales/pt-BR.json';

import { isStorageAvailable } from './utils/storage';

const LANGUAGE_STORAGE_KEY = 'language';

const canUseStorage = isStorageAvailable('localStorage');

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslations,
      },
      'pt-BR': {
        translation: ptBRTranslations,
      },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    detection: {
      order: canUseStorage ? ['localStorage', 'navigator'] : ['navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: canUseStorage ? ['localStorage'] : [],
    },
  });

export default i18n;
