import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";

export { Rating };
export type { Card, Grade };

/** Target 90% recall: FSRS default, a good balance of workload and retention. */
export const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true, maximum_interval: 3650 });

export function newCard(now = new Date()): Card {
  return createEmptyCard(now);
}

export function review(card: Card, grade: Grade, now = new Date()) {
  return scheduler.next(card, now, grade);
}

/** Probability (0–1) the learner still remembers the card right now. */
export function recall(card: Card, now = new Date()): number {
  return scheduler.get_retrievability(card, now, false);
}

/** Review budget per session, by daily study time. Keeps sessions short after a break. */
export function reviewCap(dailyMinutes: 10 | 20 | 30 | 45 = 20): number {
  return { 10: 20, 20: 35, 30: 50, 45: 80 }[dailyMinutes];
}

/**
 * Today's review queue. After a break many cards are overdue; instead of showing
 * all of them (the backlog that makes people quit), take the cap and leave the rest
 * due — they roll into the next sessions. Most-forgotten cards come first.
 */
export function buildReviewQueue<T extends { fsrs: Card }>(cards: T[], now: Date, cap: number): { queue: T[]; deferred: number } {
  const due = cards.filter((c) => c.fsrs.due.getTime() <= now.getTime());
  const ranked = due
    .map((c) => ({ c, r: c.fsrs.reps === 0 ? 1 : recall(c.fsrs, now) }))
    .sort((a, b) => a.r - b.r || a.c.fsrs.due.getTime() - b.c.fsrs.due.getTime())
    .map((x) => x.c);
  return { queue: ranked.slice(0, cap), deferred: Math.max(0, ranked.length - cap) };
}
