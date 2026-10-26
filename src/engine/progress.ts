import { db, type MasteryRow, type Profile, type StudyCard, type WaylineDB } from "../db/db";
import type { GlossaryEntry, Item } from "../content/schema";
import { library as defaultLibrary, bandAtLeast, type Library } from "../content/library";
import { newCard, review, Rating, buildReviewQueue, reviewCap, type Grade } from "../lib/srs";

export type Outcome = "first" | "hint" | "revealed";

/** Correct first time → Good; needed a hint → Hard; had to see the answer → Again. */
const RATING: Record<Outcome, Grade> = { first: Rating.Good, hint: Rating.Hard, revealed: Rating.Again };

export const MASTERY_ACCURACY = 0.8;

export function localDay(d = new Date()): string {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

async function bumpActivity(database: WaylineDB, now: Date, patch: { reviews?: number; newItems?: number; seconds?: number }) {
  const day = localDay(now);
  const row = (await database.activity.get(day)) ?? { day, minutes: 0, reviews: 0, newItems: 0 };
  row.reviews += patch.reviews ?? 0;
  row.newItems += patch.newItems ?? 0;
  row.minutes += (patch.seconds ?? 0) / 60;
  await database.activity.put(row);
}

/** Record one answered item: schedules it for review, updates competence mastery, logs or resolves mistakes. */
export async function recordItem(
  item: Item,
  outcome: Outcome,
  given: string,
  opts: { now?: Date; database?: WaylineDB; seconds?: number } = {},
): Promise<void> {
  const now = opts.now ?? new Date();
  const database = opts.database ?? db;
  await database.transaction("rw", [database.cards, database.reviews, database.mastery, database.mistakes, database.activity], async () => {
    const id = `item:${item.id}`;
    const existing = await database.cards.get(id);
    const { card, log } = review(existing?.fsrs ?? newCard(now), RATING[outcome], now);
    await database.cards.put({
      id,
      kind: "item",
      ref: item.id,
      lastOutcome: outcome,
      fsrs: card,
      createdAt: existing?.createdAt ?? now.toISOString(),
    });
    await database.reviews.add({ cardId: id, log });

    const m: MasteryRow = (await database.mastery.get(item.competence)) ?? {
      competence: item.competence,
      correct: 0,
      attempts: 0,
      hintsUsed: 0,
      updatedAt: now.toISOString(),
    };
    m.attempts += 1;
    if (outcome === "first") m.correct += 1;
    if (outcome === "hint") m.hintsUsed += 1;
    m.updatedAt = now.toISOString();
    await database.mastery.put(m);

    if (outcome !== "first") {
      await database.mistakes.add({ itemId: item.id, competence: item.competence, tags: item.tags, given, at: now.toISOString(), resolved: false });
    } else {
      await database.mistakes.where("itemId").equals(item.id).modify({ resolved: true });
    }
    await bumpActivity(database, now, existing ? { reviews: 1, seconds: opts.seconds } : { newItems: 1, seconds: opts.seconds });
  });
}

/** Save a word met in context (Word Lens). Saving again keeps its memory state. */
export async function saveWord(entry: GlossaryEntry, context: string | undefined, database: WaylineDB = db, now = new Date()): Promise<void> {
  const id = `word:${entry.word.toLowerCase()}|${entry.pos}`;
  if (await database.cards.get(id)) return;
  await database.cards.put({ id, kind: "word", ref: `${entry.word}|${entry.pos}`, context, fsrs: newCard(now), createdAt: now.toISOString() });
}

export async function removeWord(entry: GlossaryEntry, database: WaylineDB = db): Promise<void> {
  await database.cards.delete(`word:${entry.word.toLowerCase()}|${entry.pos}`);
}

/** Self-graded review of a word card. */
export async function gradeWord(card: StudyCard, grade: Grade, database: WaylineDB = db, now = new Date()): Promise<void> {
  const { card: next, log } = review(card.fsrs, grade, now);
  await database.transaction("rw", [database.cards, database.reviews, database.activity], async () => {
    await database.cards.put({ ...card, fsrs: next });
    await database.reviews.add({ cardId: card.id, log });
    await bumpActivity(database, now, { reviews: 1 });
  });
}

export type CompetenceProgress = {
  id: string;
  total: number;
  answered: number;
  accuracy: number; // first-try correct / attempts
  mastered: boolean;
  unlocked: boolean;
};

export async function competenceProgress(lib: Library = defaultLibrary, database: WaylineDB = db): Promise<Map<string, CompetenceProgress>> {
  const cards = await database.cards.where("kind").equals("item").toArray();
  const answered = new Set(cards.map((c) => c.ref));
  const masteryRows = new Map((await database.mastery.toArray()).map((m) => [m.competence, m]));
  const out = new Map<string, CompetenceProgress>();
  for (const c of lib.competences) {
    const items = lib.itemsByCompetence.get(c.id) ?? [];
    const m = masteryRows.get(c.id);
    const accuracy = m && m.attempts ? m.correct / m.attempts : 0;
    const done = items.filter((i) => answered.has(i.id)).length;
    out.set(c.id, {
      id: c.id,
      total: items.length,
      answered: done,
      accuracy,
      mastered: items.length > 0 && done === items.length && accuracy >= MASTERY_ACCURACY,
      unlocked: false,
    });
  }
  for (const c of lib.competences) {
    const p = out.get(c.id)!;
    p.unlocked = c.prerequisites.every((pre) => out.get(pre)?.answered === out.get(pre)?.total && (out.get(pre)?.total ?? 0) > 0);
  }
  return out;
}

export type Step =
  | { kind: "review-item"; item: Item; card: StudyCard }
  | { kind: "review-word"; entry: GlossaryEntry; card: StudyCard }
  | { kind: "note"; noteId: string }
  | { kind: "item"; item: Item }
  | { kind: "text"; textId: string };

export type SessionPlan = {
  competenceId: string | null;
  steps: Step[];
  deferredReviews: number;
  routeComplete: boolean;
};

const NEW_ITEMS: Record<10 | 20 | 30 | 45, number> = { 10: 3, 20: 6, 30: 8, 45: 12 };

/** Where the learner's route starts, from their placement. */
export function startBand(profile: Profile): "preA1" | "A1" {
  return profile.placedBand === "preA1" ? "preA1" : "A1";
}

/** Today's plan: recall (capped due reviews) → understand (unseen notes) → apply (new items) → experience (text). */
export async function planSession(
  profile: Profile,
  lib: Library = defaultLibrary,
  database: WaylineDB = db,
  now = new Date(),
  opts: { reviewOnly?: boolean } = {},
): Promise<SessionPlan> {
  const minutes = profile.dailyMinutes ?? 20;
  const progress = await competenceProgress(lib, database);
  const cards = await database.cards.toArray();
  const byRef = new Map(cards.map((c) => [c.ref, c]));

  const { queue, deferred } = buildReviewQueue(cards, now, opts.reviewOnly ? reviewCap(minutes) : Math.round(reviewCap(minutes) * 0.6));
  const steps: Step[] = [];
  for (const card of queue) {
    if (card.kind === "item") {
      const item = lib.item.get(card.ref);
      if (item) steps.push({ kind: "review-item", item, card });
    } else if (card.kind === "word") {
      const [word] = card.ref.split("|");
      const entry = lib.lens.get(word.toLowerCase());
      if (entry) steps.push({ kind: "review-word", entry, card });
    }
  }

  const from = startBand(profile);
  if (opts.reviewOnly) return { competenceId: null, steps, deferredReviews: deferred, routeComplete: false };
  const current = lib.competences.find((c) => {
    const p = progress.get(c.id)!;
    return bandAtLeast(c.band, from) && p.unlocked && p.answered < p.total;
  });

  if (current) {
    const fresh = (lib.itemsByCompetence.get(current.id) ?? []).filter((i) => !byRef.has(i.id));
    const plain = fresh.filter((i) => !i.textId).slice(0, NEW_ITEMS[minutes]);
    for (const n of lib.notesByCompetence.get(current.id) ?? []) {
      if (!profile.seenNotes.includes(n.id) && plain.length) {
        steps.push({ kind: "note", noteId: n.id });
        break; // one new idea per session
      }
    }
    for (const i of plain) steps.push({ kind: "item", item: i });

    // Read the text once most of the region's practice is done (so its words are mostly known).
    const textItems = fresh.filter((i) => i.textId);
    const nonTextTotal = (lib.itemsByCompetence.get(current.id) ?? []).filter((i) => !i.textId).length;
    const nonTextDone = nonTextTotal - fresh.filter((i) => !i.textId).length + plain.length;
    if (textItems.length && nonTextDone >= Math.ceil(nonTextTotal * 0.5)) {
      const textId = textItems[0].textId!;
      steps.push({ kind: "text", textId });
      for (const i of textItems.filter((t) => t.textId === textId)) steps.push({ kind: "item", item: i });
    }
  }

  const routeComplete = !current && lib.competences.filter((c) => bandAtLeast(c.band, from)).every((c) => progress.get(c.id)!.answered === progress.get(c.id)!.total);
  return { competenceId: current?.id ?? null, steps, deferredReviews: deferred, routeComplete };
}
