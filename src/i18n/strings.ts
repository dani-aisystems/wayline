/**
 * Interface strings. English is the source of truth; every other language must
 * provide exactly the same keys (enforced by the type below and by i18n.test.ts).
 */
export const SUPPORTED_LANGUAGES = ["en", "bg"] as const;
export type UiLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<UiLanguage, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  bg: { native: "Български", english: "Bulgarian" },
};

const en = {
  "app.tagline": "Draw your way into English.",
  "app.skip": "Skip to content",
  "lang.question": "Which language do you want explanations in?",
  "lang.hint": "Exercises and texts are always in English. You can change this later in settings.",
  "lang.englishOnly": "English only",
  "lang.continue": "Continue",
  "lang.saved": "Explanations will be in {language}.",
  "theme.label": "Theme",
  "theme.system": "Auto",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "home.lead": "A free path from your first English word to confident, independent English. Your progress stays on this device.",
  "home.start": "Start learning",
  "home.stored": "No account needed. Nothing leaves your device.",
  "storage.notice": "Progress is saved in this browser only. Clearing browser data deletes it, so back it up from settings.",
  "error.storage": "This browser is blocking local storage, so progress can't be saved. Turn off private browsing or allow site data, then reload.",
} as const;

export type StringKey = keyof typeof en;
type Dictionary = Record<StringKey, string>;

const bg: Dictionary = {
  "app.tagline": "Начертай своя път към английския.",
  "app.skip": "Към съдържанието",
  "lang.question": "На какъв език искаш обясненията?",
  "lang.hint": "Упражненията и текстовете винаги са на английски. Можеш да промениш това по-късно в настройките.",
  "lang.englishOnly": "Само английски",
  "lang.continue": "Продължи",
  "lang.saved": "Обясненията ще бъдат на {language}.",
  "theme.label": "Тема",
  "theme.system": "Авто",
  "theme.light": "Светла",
  "theme.dark": "Тъмна",
  "home.lead": "Безплатен път от първата ти дума на английски до уверен и самостоятелен английски. Напредъкът ти остава на това устройство.",
  "home.start": "Започни",
  "home.stored": "Не е нужен профил. Нищо не напуска устройството ти.",
  "storage.notice": "Напредъкът се пази само в този браузър. Изтриването на данните на браузъра го изтрива, затова прави резервно копие от настройките.",
  "error.storage": "Този браузър блокира локалното съхранение и напредъкът не може да се запази. Изключи режима „инкогнито“ или разреши данните на сайта и презареди.",
};

export const DICTIONARIES: Record<UiLanguage, Dictionary> = { en, bg };

/** Bulgarian name of each language, for "Explanations will be in …" in the learner's own language. */
export const LANGUAGE_NAME_IN: Record<UiLanguage, Record<UiLanguage, string>> = {
  en: { en: "English", bg: "Bulgarian" },
  bg: { en: "английски", bg: "български" },
};

export function translate(lang: UiLanguage, key: StringKey, vars: Record<string, string> = {}): string {
  const template = DICTIONARIES[lang][key] ?? DICTIONARIES.en[key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
}
