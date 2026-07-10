import { useAppSettings } from "../context/AppSettingsContext";

export {
  catalogs,
  createTranslator,
  getActiveLanguage,
  getDeviceLanguage,
  getLocaleTag,
  isAppLanguage,
  languageOptions,
  localeTags,
  resolveAppLanguage,
  setActiveLanguage,
  supportedLanguages,
  translate,
  translateActive,
} from "./catalogs";
export type { AppLanguage, Translate, TranslationValues } from "./catalogs";

export function useI18n() {
  const { language, locale, setLanguage, settingsReady, t } = useAppSettings();
  return { language, locale, setLanguage, settingsReady, t };
}
