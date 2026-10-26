import { describe, expect, it } from "vitest";
import { buildReviewQueue, newCard, Rating, recall, review, reviewCap } from "./srs";

const DAY = 86_400_000;

describe("spaced repetition", () => {
  it("schedules a well-known card further out than a forgotten one", () => {
    const start = new Date("2026-11-01T09:00:00Z");
    let card = newCard(start);
    card = review(card, Rating.Good, start).card;
    const later = new Date(card.due.getTime() + 1000);
    const good = review(card, Rating.Good, later).card;
    const again = review(card, Rating.Again, later).card;
    expect(good.due.getTime()).toBeGreaterThan(again.due.getTime());
  });

  it("recall probability falls over time", () => {
    const start = new Date("2026-11-01T09:00:00Z");
    const card = review(newCard(start), Rating.Good, start).card;
    expect(recall(card, new Date(start.getTime() + 2 * DAY))).toBeGreaterThan(recall(card, new Date(start.getTime() + 60 * DAY)));
  });

  it("caps the queue after a 7-day break and defers the rest", () => {
    const start = new Date("2026-11-01T09:00:00Z");
    const cards = Array.from({ length: 120 }, (_, i) => ({
      id: String(i),
      fsrs: review(newCard(start), i % 3 ? Rating.Good : Rating.Hard, start).card,
    }));
    const afterBreak = new Date(start.getTime() + 8 * DAY);
    const { queue, deferred } = buildReviewQueue(cards, afterBreak, reviewCap(20));
    expect(queue.length).toBe(35);
    expect(deferred).toBe(85);
    // Most-forgotten first.
    const r = queue.map((c) => recall(c.fsrs, afterBreak));
    expect([...r].sort((a, b) => a - b)).toEqual(r);
  });

  it("does not include cards that are not due yet", () => {
    const now = new Date("2026-11-01T09:00:00Z");
    const card = review(newCard(now), Rating.Easy, now).card;
    expect(buildReviewQueue([{ fsrs: card }], now, 10).queue).toHaveLength(0);
  });
});
