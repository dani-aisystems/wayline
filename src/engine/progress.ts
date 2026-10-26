import { db, type MasteryRow, type Profile, type StudyCard, type WaylineDB } from "../db/db";
import { BANDS, type Band, type GlossaryEntry, type Item, type Skill } from "../content/schema";
import { competenceWeight, learnerModel } from "./learner";
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

/**
 * Progress per competence. A prerequisite counts as met when it has been fully practised, or when it sits
 * below the learner's start band (they placed out of it) — so a B2 learner isn't locked behind A1 lessons.
 */
export async function competenceProgress(lib: Library = defaultLibrary, database: WaylineDB = db, from: Band = "preA1"): Promise<Map<string, CompetenceProgress>> {
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
    p.unlocked = c.prerequisites.every((pre) => {
      const q = out.get(pre);
      const preBand = lib.competence.get(pre)?.band;
      if (preBand && !bandAtLeast(preBand, from)) return true;
      return !!q && q.total > 0 && q.answered === q.total;
    });
  }
  return out;
}

/** Where a step sits in the daily plan. */
export type Phase = "warmup" | "learn" | "practice" | "reinforce" | "apply";

export type Step = (
  | { kind: "review-item"; item: Item; card: StudyCard }
  | { kind: "review-word"; entry: GlossaryEntry; card: StudyCard }
  | { kind: "note"; noteId: string }
  | { kind: "item"; item: Item }
  | { kind: "text"; textId: string }
) & { phase?: Phase };

/** Why each part of the plan is there, for the dashboard ("Reinforcing: conditionals"). */
export type Reason =
  | { kind: "review"; count: number; deferred: number }
  | { kind: "new"; competenceId: string; count: number; because: "continue" | "next" | "priority"; skill?: Skill }
  | { kind: "reinforce"; tag: string; count: number }
  | { kind: "practice"; skill: Skill; itemId: string };

export type SessionPlan = {
  competenceId: string | null;
  steps: Step[];
  deferredReviews: number;
  routeComplete: boolean;
  reasons: Reason[];
};

const NEW_ITEMS: Record<10 | 20 | 30 | 45, number> = { 10: 3, 20: 6, 30: 8, 45: 12 };
const REINFORCE: Record<10 | 20 | 30 | 45, number> = { 10: 1, 20: 2, 30: 3, 45: 4 };

/**
 * Where the learner's route starts: the level they accepted after placement. If no lessons exist yet at that
 * level, fall back to the highest level below it that has lessons (the results screen says so).
 */
export function startBand(profile: Profile, lib: Library = defaultLibrary): Band {
  const wanted: Band = profile.acceptedBand ?? (profile.placedBand === "preA1" ? "preA1" : "A1");
  if (lib.competences.some((c) => bandAtLeast(c.band, wanted))) return wanted;
  const below = lib.competences.filter((c) => !bandAtLeast(c.band, wanted)).map((c) => c.band);
  return below.sort((a, b) => BANDS.indexOf(b) - BANDS.indexOf(a))[0] ?? "A1";
}

const ORAL: Item["type"][] = ["speak", "listen", "dialogue"];

/**
 * Today's plan, built deterministically from stored evidence:
 *  1. Warm-up: due reviews (capped so a break never becomes a backlog).
 *  2. Learn: one new idea from the chosen region.
 *  3. Practice: new items from that region, easiest first.
 *  4. Reinforce: items the learner got wrong and hasn't fixed, grouped by their most frequent weak topic.
 *  5. Apply: the region's text once half of it is practised, plus one listening or speaking task when those
 *     skills are priorities (or the session is long enough).
 * The region is chosen among unlocked, unfinished regions at or above the start level: lowest level first, then
 * the one already in progress, then the one that best matches today's priorities (weak skills, focus, goal).
 */
export async function planSession(
  profile: Profile,
  lib: Library = defaultLibrary,
  database: WaylineDB = db,
  now = new Date(),
  opts: { reviewOnly?: boolean } = {},
): Promise<SessionPlan> {
  const minutes = profile.dailyMinutes ?? 20;
  const from = startBand(profile, lib);
  const [progress, cards, model] = await Promise.all([competenceProgress(lib, database, from), database.cards.toArray(), learnerModel(profile, lib, database)]);
  const byRef = new Map(cards.map((c) => [c.ref, c]));
  const reasons: Reason[] = [];

  const { queue, deferred } = buildReviewQueue(cards, now, opts.reviewOnly ? reviewCap(minutes) : Math.round(reviewCap(minutes) * 0.6));
  const steps: Step[] = [];
  for (const card of queue) {
    if (card.kind === "item") {
      const item = lib.item.get(card.ref);
      if (item) steps.push({ kind: "review-item", item, card, phase: "warmup" });
    } else if (card.kind === "word") {
      const [word] = card.ref.split("|");
      const entry = lib.lens.get(word.toLowerCase());
      if (entry) steps.push({ kind: "review-word", entry, card, phase: "warmup" });
    }
  }
  if (steps.length) reasons.push({ kind: "review", count: steps.length, deferred });
  if (opts.reviewOnly) return { competenceId: null, steps, deferredReviews: deferred, routeComplete: false, reasons };

  const order = new Map(lib.competences.map((c, i) => [c.id, i]));
  const candidates = lib.competences.filter((c) => {
    const p = progress.get(c.id)!;
    return bandAtLeast(c.band, from) && p.unlocked && p.answered < p.total;
  });
  const score = (c: (typeof candidates)[number]) => competenceWeight(c.skills, model) + (progress.get(c.id)!.answered > 0 ? 10 : 0);
  candidates.sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band) || score(b) - score(a) || order.get(a.id)! - order.get(b.id)!);
  const current = candidates[0];
  const used = new Set<string>(steps.flatMap((s) => (s.kind === "review-item" ? [s.item.id] : [])));

  if (current) {
    const fresh = (lib.itemsByCompetence.get(current.id) ?? []).filter((i) => !byRef.has(i.id));
    const plain = fresh.filter((i) => !i.textId).slice(0, NEW_ITEMS[minutes]);
    for (const n of lib.notesByCompetence.get(current.id) ?? []) {
      if (!(profile.seenNotes ?? []).includes(n.id) && plain.length) {
        steps.push({ kind: "note", noteId: n.id, phase: "learn" });
        break; // one new idea per session
      }
    }
    for (const i of plain) {
      steps.push({ kind: "item", item: i, phase: "practice" });
      used.add(i.id);
    }
    const inProgress = progress.get(current.id)!.answered > 0;
    const pri = model.priorities.find((p) => current.skills.includes(p.skill));
    reasons.push({ kind: "new", competenceId: current.id, count: plain.length, because: inProgress ? "continue" : pri ? "priority" : "next", skill: pri?.skill });
  }

  // Reinforce the most frequent weak topic with the learner's own unresolved mistakes (validated items, not generated ones).
  const weak = model.weakTags[0];
  if (weak) {
    const ids = model.weakTags.flatMap((w) => w.itemIds).filter((id, k, all) => all.indexOf(id) === k && !used.has(id));
    const pick = ids.slice(0, REINFORCE[minutes]).map((id) => lib.item.get(id)).filter((i): i is Item => !!i);
    for (const i of pick) {
      steps.push({ kind: "item", item: i, phase: "reinforce" });
      used.add(i.id);
    }
    if (pick.length) reasons.push({ kind: "reinforce", tag: weak.tag, count: pick.length });
  }

  if (current) {
    const fresh = (lib.itemsByCompetence.get(current.id) ?? []).filter((i) => !byRef.has(i.id));
    const textItems = fresh.filter((i) => i.textId);
    const nonTextTotal = (lib.itemsByCompetence.get(current.id) ?? []).filter((i) => !i.textId).length;
    const plainCount = steps.filter((s) => s.phase === "practice").length;
    const nonTextDone = nonTextTotal - fresh.filter((i) => !i.textId).length + plainCount;
    if (textItems.length && nonTextDone >= Math.ceil(nonTextTotal * 0.5)) {
      const textId = textItems[0].textId!;
      steps.push({ kind: "text", textId, phase: "apply" });
      for (const i of textItems.filter((t) => t.textId === textId)) {
        steps.push({ kind: "item", item: i, phase: "apply" });
        used.add(i.id);
      }
    }
  }

  // One listening or speaking task when those skills are priorities, or in sessions of 20+ minutes.
  const oralPriority = model.priorities.find((p) => p.skill === "speaking" || p.skill === "listening");
  const hasOral = steps.some((s) => (s.kind === "item" || s.kind === "review-item") && ORAL.includes(s.item.type));
  if (!hasOral && (oralPriority || minutes >= 20)) {
    const want: Skill[] = oralPriority ? [oralPriority.skill] : ["listening", "speaking"];
    const oral = lib.competences
      .filter((c) => bandAtLeast(c.band, from) && progress.get(c.id)!.unlocked)
      .flatMap((c) => lib.itemsByCompetence.get(c.id) ?? [])
      .filter((i) => ORAL.includes(i.type) && !byRef.has(i.id) && !used.has(i.id))
      .sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band) || Number(want.includes(b.skill)) - Number(want.includes(a.skill)) || a.difficulty - b.difficulty)[0];
    if (oral) {
      steps.push({ kind: "item", item: oral, phase: "apply" });
      reasons.push({ kind: "practice", skill: oral.skill, itemId: oral.id });
    }
  }

  const routeComplete = !current && lib.competences.filter((c) => bandAtLeast(c.band, from)).every((c) => progress.get(c.id)!.answered === progress.get(c.id)!.total);
  return { competenceId: current?.id ?? null, steps, deferredReviews: deferred, routeComplete, reasons };
}
