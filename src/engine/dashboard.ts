import { Rating } from "ts-fsrs";
import { db, type Profile, type StudyCard, type WaylineDB } from "../db/db";
import { library as defaultLibrary, bandAtLeast, type Library } from "../content/library";
import type { Skill } from "../content/schema";
import { competenceProgress, localDay, planSession, startBand, type SessionPlan } from "./progress";
import { learnerModel, SKILLS, type LearnerModel } from "./learner";
import { activeDays, xpSummary, type XpSummary } from "./xp";

export type WordState = "new" | "learning" | "reviewing" | "strong" | "mastered";

/** Learning state of a review card, from its FSRS memory (never "mastered" after one answer). */
export function cardState(c: StudyCard): WordState {
  const f = c.fsrs;
  if (f.reps === 0) return "new";
  if (f.state === 1 || f.state === 3) return "learning";
  if (f.stability >= 60 && f.reps >= 4) return "mastered";
  if (f.stability >= 14) return "strong";
  return "reviewing";
}

export type Insight =
  | { kind: "due"; n: number }
  | { kind: "weak-topic"; tag: string; count: number }
  | { kind: "improved"; skill: Skill; before: number; after: number }
  | { kind: "consistency"; days: number; of: number }
  | { kind: "words"; n: number };

export type Dashboard = {
  plan: SessionPlan;
  model: LearnerModel;
  xp: XpSummary;
  achievements: { id: string; at: string }[];
  days: { day: string; active: boolean; minutes: number }[];
  weekly: { day: string; minutes: number; reviews: number; newItems: number; xp: number }[];
  dueWords: number;
  dueItems: number;
  savedWords: number;
  openMistakes: number;
  doneToday: boolean;
  progress: Awaited<ReturnType<typeof competenceProgress>>;
  insights: Insight[];
  reviewAccuracy: number | null;
};

/** Accuracy change for a skill: the latest 10 attempts against the 10 before (needs ≥ 6 in each window). */
async function skillTrend(lib: Library, database: WaylineDB): Promise<{ skill: Skill; before: number; after: number }[]> {
  const logs = (await database.reviews.toArray()).filter((r) => r.cardId.startsWith("item:")).sort((a, b) => a.log.review.getTime() - b.log.review.getTime());
  const out: { skill: Skill; before: number; after: number }[] = [];
  for (const skill of SKILLS) {
    const own = logs.filter((r) => lib.item.get(r.cardId.slice(5))?.skill === skill).map((r) => (r.log.rating === Rating.Good || r.log.rating === Rating.Easy ? 1 : 0));
    const after = own.slice(-10);
    const before = own.slice(-20, -10);
    if (after.length >= 6 && before.length >= 6) {
      const a = after.reduce<number>((s, x) => s + x, 0) / after.length;
      const b = before.reduce<number>((s, x) => s + x, 0) / before.length;
      out.push({ skill, before: b, after: a });
    }
  }
  return out;
}

export async function dashboard(profile: Profile, lib: Library = defaultLibrary, database: WaylineDB = db, now = new Date()): Promise<Dashboard> {
  const from = startBand(profile, lib);
  const [plan, model, xp, achievements, days, activity, cards, mistakes, progress, trend, xpRows, logs] = await Promise.all([
    planSession(profile, lib, database, now),
    learnerModel(profile, lib, database),
    xpSummary(database, now),
    database.achievements.toArray(),
    activeDays(14, database, now),
    database.activity.toArray(),
    database.cards.toArray(),
    database.mistakes.toArray(),
    competenceProgress(lib, database, from),
    skillTrend(lib, database),
    database.xp.toArray(),
    database.reviews.toArray(),
  ]);
  const dueWords = cards.filter((c) => c.kind === "word" && c.fsrs.due <= now).length;
  const dueItems = cards.filter((c) => c.kind === "item" && c.fsrs.due <= now).length;
  const savedWords = cards.filter((c) => c.kind === "word").length;
  const openMistakes = new Set(mistakes.filter((m) => !m.resolved).map((m) => m.itemId)).size;
  const today = localDay(now);
  const doneToday = xpRows.some((r) => r.id === `plan:${today}`);

  const actByDay = new Map(activity.map((a) => [a.day, a]));
  const weekly = days.slice(-7).map((d) => {
    const a = actByDay.get(d.day);
    return { day: d.day, minutes: Math.round((a?.minutes ?? 0) * 10) / 10, reviews: a?.reviews ?? 0, newItems: a?.newItems ?? 0, xp: xp.byDay.find((x) => x.day === d.day)?.xp ?? 0 };
  });

  // Share of reviews in the last 7 days answered without help (state 2 = review, 3 = relearning).
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const recentReviews = logs.filter((r) => r.log.review.getTime() >= weekAgo && (r.log.state === 2 || r.log.state === 3));
  const reviewAccuracy = recentReviews.length >= 5 ? recentReviews.filter((r) => r.log.rating >= Rating.Good).length / recentReviews.length : null;

  const insights: Insight[] = [];
  if (dueWords + dueItems > 0) insights.push({ kind: "due", n: dueWords + dueItems });
  if (model.weakTags[0] && model.weakTags[0].count >= 2) insights.push({ kind: "weak-topic", tag: model.weakTags[0].tag, count: model.weakTags[0].count });
  const best = trend.filter((t) => t.after - t.before >= 0.2).sort((a, b) => b.after - b.before - (a.after - a.before))[0];
  if (best) insights.push({ kind: "improved", ...best });
  const active7 = days.slice(-7).filter((d) => d.active).length;
  if (active7 >= 2) insights.push({ kind: "consistency", days: active7, of: 7 });
  if (savedWords >= 5) insights.push({ kind: "words", n: savedWords });

  return { plan, model, xp, achievements, days, weekly, dueWords, dueItems, savedWords, openMistakes, doneToday, progress, insights, reviewAccuracy };
}

/** Route stops from the start band upward, for the journey section. */
export function route(lib: Library, profile: Profile) {
  const from = startBand(profile, lib);
  return lib.competences.filter((c) => bandAtLeast(c.band, from));
}
