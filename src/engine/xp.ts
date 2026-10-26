import { db, type WaylineDB, type XpRow } from "../db/db";
import { library as defaultLibrary, type Library } from "../content/library";
import type { Item } from "../content/schema";
import { localDay, competenceProgress } from "./progress";

/**
 * Experience points: a measure of practice done, never of proficiency (CEFR level comes only from
 * placement and mastery). Every award has an idempotency key, so a reload, a double click or a repeated
 * completion request can't pay twice. Repeat practice still earns XP when it is genuinely new
 * (another due review, a new item), not when the same thing is completed again the same day.
 */
export const XP = {
  item: 5, // first time an exercise is completed
  speaking: 15, // a speaking or dialogue exercise, once per item per day
  listening: 10, // a listening exercise, once per item per day
  review: 2, // each due review answered
  session: 20, // finishing a lesson session with new material
  plan: 30, // finishing the day's plan (once per day)
  word: 1, // saving a word to review (once per word, ever)
  placement: 25, // completing a level test (once per test)
} as const;

export async function award(id: string, amount: number, reason: XpRow["reason"], database: WaylineDB = db, now = new Date()): Promise<boolean> {
  return database.transaction("rw", database.xp, async () => {
    if (await database.xp.get(id)) return false;
    await database.xp.add({ id, amount, reason, at: now.toISOString(), day: localDay(now) });
    return true;
  });
}

/** Award XP for one answered exercise. `isNew` = first time this item was ever answered. */
export async function awardForItem(item: Item, isNew: boolean, database: WaylineDB = db, now = new Date()): Promise<number> {
  const day = localDay(now);
  let total = 0;
  if (isNew && (await award(`item:${item.id}`, XP.item, "lesson", database, now))) total += XP.item;
  if (!isNew && (await award(`review:${item.id}:${day}`, XP.review, "review", database, now))) total += XP.review;
  if ((item.type === "speak" || item.type === "dialogue") && (await award(`speaking:${item.id}:${day}`, XP.speaking, "speaking", database, now))) total += XP.speaking;
  if (item.type === "listen" && (await award(`listening:${item.id}:${day}`, XP.listening, "listening", database, now))) total += XP.listening;
  return total;
}

/** Levels grow gently: level n needs 50·n·(n+1) total XP (100, 300, 600, 1000…). */
export function levelFor(total: number): { level: number; into: number; span: number } {
  let level = 0;
  while (50 * (level + 1) * (level + 2) <= total) level++;
  const floor = 50 * level * (level + 1);
  const next = 50 * (level + 1) * (level + 2);
  return { level: level + 1, into: total - floor, span: next - floor };
}

export type XpSummary = { total: number; today: number; week: number; level: ReturnType<typeof levelFor>; byDay: { day: string; xp: number }[] };

export async function xpSummary(database: WaylineDB = db, now = new Date()): Promise<XpSummary> {
  const rows = await database.xp.toArray();
  const days = Array.from({ length: 7 }, (_, i) => localDay(new Date(now.getTime() - (6 - i) * 86_400_000)));
  const byDay = days.map((day) => ({ day, xp: rows.filter((r) => r.day === day).reduce((s, r) => s + r.amount, 0) }));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { total, today: byDay.at(-1)!.xp, week: byDay.reduce((s, d) => s + d.xp, 0), level: levelFor(total), byDay };
}

/** Achievements: few, specific, earned by real learning. Checked after activity; each is stored once. */
export const ACHIEVEMENTS = [
  "first-lesson",
  "first-speaking",
  "first-listening",
  "level-test",
  "words-10",
  "words-50",
  "reviews-3-days",
  "region-complete",
  "region-mastered",
  "weak-skill-up",
] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];

export async function checkAchievements(lib: Library = defaultLibrary, database: WaylineDB = db, now = new Date()): Promise<AchievementId[]> {
  const [xp, words, reviews, have, progress, placements] = await Promise.all([
    database.xp.toArray(),
    database.cards.where("kind").equals("word").count(),
    database.reviews.toArray(),
    database.achievements.toArray(),
    competenceProgress(lib, database),
    database.placements.count(),
  ]);
  const got = new Set(have.map((a) => a.id));
  const earned: AchievementId[] = [];
  const reviewDays = new Set(
    reviews.filter((r) => r.log.state === 2 || r.log.state === 3).map((r) => localDay(new Date(r.log.review))).filter((d) => d >= localDay(new Date(now.getTime() - 6 * 86_400_000))),
  );
  const checks: Record<AchievementId, boolean> = {
    "first-lesson": xp.some((r) => r.id.startsWith("session:")),
    "first-speaking": xp.some((r) => r.reason === "speaking"),
    "first-listening": xp.some((r) => r.reason === "listening"),
    "level-test": placements > 0,
    "words-10": words >= 10,
    "words-50": words >= 50,
    "reviews-3-days": reviewDays.size >= 3,
    "region-complete": [...progress.values()].some((p) => p.total > 0 && p.answered === p.total),
    "region-mastered": [...progress.values()].some((p) => p.mastered),
    "weak-skill-up": false, // set by the dashboard insight logic when a previously weak skill reaches 80%
  };
  for (const id of ACHIEVEMENTS) {
    if (checks[id] && !got.has(id)) {
      await database.achievements.put({ id, at: now.toISOString() });
      earned.push(id);
    }
  }
  return earned;
}

/** Days with any study in the last `n` days (oldest first), for a gentle consistency view. No streak penalties. */
export async function activeDays(n = 14, database: WaylineDB = db, now = new Date()): Promise<{ day: string; active: boolean; minutes: number }[]> {
  const rows = new Map((await database.activity.toArray()).map((a) => [a.day, a]));
  return Array.from({ length: n }, (_, i) => {
    const day = localDay(new Date(now.getTime() - (n - 1 - i) * 86_400_000));
    const a = rows.get(day);
    return { day, active: !!a && a.newItems + a.reviews > 0, minutes: a?.minutes ?? 0 };
  });
}
