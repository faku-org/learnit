import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { SUPPORTED_LANGUAGES, setLanguage, type SupportedLanguage } from "@/lib/i18n";

const LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Español",
};

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2">
      {SUPPORTED_LANGUAGES.map((lang) => (
        <button
          key={lang}
          onClick={() => setLanguage(lang)}
          className={[
            "px-3 py-1.5 rounded-lg text-xs transition-colors",
            i18n.resolvedLanguage === lang
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          {LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
