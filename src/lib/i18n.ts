import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

export const SUPPORTED_LANGUAGES = ["en", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const STORAGE_KEY = "learnit_locale";

export function detectLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "es") return stored;
  return navigator.language.slice(0, 2) === "es" ? "es" : "en";
}

if (!i18next.isInitialized) {
  i18next.use(initReactI18next).init({
    resources: { en: { translation: en }, es: { translation: es } },
    lng: detectLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
}

export function setLanguage(lang: SupportedLanguage) {
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  i18next.changeLanguage(lang);
}

export default i18next;
