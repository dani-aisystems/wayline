import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { WaylineDB } from "./db";
import { exportBackup, importBackup } from "./backup";
import { newCard, review, Rating } from "../lib/srs";

let n = 0;
const fresh = () => new WaylineDB(`test-${++n}`);
const dbs: WaylineDB[] = [];
afterEach(async () => {
  for (const d of dbs.splice(0)) await d.delete();
});

async function seeded() {
  const d = fresh();
  dbs.push(d);
  const now = new Date("2026-11-01T09:00:00Z");
  const { card, log } = review(newCard(now), Rating.Good, now);
  await d.profile.put({ id: "me", createdAt: now.toISOString(), explanationLanguage: "bg", theme: "system", interests: ["tech"], seenNotes: [] });
  await d.cards.put({ id: "w:go", kind: "word", ref: "go", context: "I go to school.", fsrs: card, createdAt: now.toISOString() });
  await d.reviews.add({ cardId: "w:go", log });
  await d.mastery.put({ competence: "a1.hello", correct: 4, attempts: 5, hintsUsed: 1, updatedAt: now.toISOString() });
  return d;
}

describe("backup and restore", () => {
  it("round-trips through JSON with dates intact", async () => {
    const source = await seeded();
    const backup = await exportBackup(source, "test");
    const text = JSON.stringify(backup);

    const target = fresh();
    dbs.push(target);
    const result = await importBackup(text, target);
    expect(result).toEqual({ ok: true, rows: 4 });

    const card = await target.cards.get("w:go");
    expect(card?.fsrs.due).toBeInstanceOf(Date);
    expect(card?.fsrs.due.getTime()).toBe((await source.cards.get("w:go"))?.fsrs.due.getTime());
    expect((await target.profile.get("me"))?.explanationLanguage).toBe("bg");
  });

  it("replaces existing progress on import", async () => {
    const source = await seeded();
    const text = JSON.stringify(await exportBackup(source, "test"));
    const target = await seeded();
    await target.cards.put({ ...(await target.cards.get("w:go"))!, id: "w:extra" });
    await importBackup(text, target);
    expect(await target.cards.count()).toBe(1);
  });

  it("rejects non-JSON and tampered files without touching data", async () => {
    const target = await seeded();
    expect(await importBackup("not json", target)).toEqual({ ok: false, error: "not-json" });
    const bad = await exportBackup(target, "test");
    (bad.data.profile[0] as any).explanationLanguage = "<script>";
    expect(await importBackup(JSON.stringify(bad), target)).toEqual({ ok: false, error: "invalid" });
    expect((await target.profile.get("me"))?.explanationLanguage).toBe("bg");
  });
});
