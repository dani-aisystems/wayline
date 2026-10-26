import { translate, type UiLanguage } from "../i18n/strings";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "today", "tomorrow", "in 3 days", "3 days ago" in the learner's language. */
export function relativeDay(date: Date, lang: UiLanguage, now = new Date()): string {
  const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (days === 0) return translate(lang, "time.today");
  if (days === 1) return translate(lang, "time.tomorrow");
  if (days > 1) return translate(lang, "time.inDays", { n: String(days) });
  return translate(lang, "time.daysAgo", { n: String(-days) });
}
