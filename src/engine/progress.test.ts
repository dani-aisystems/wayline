import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { WaylineDB, type Profile } from "../db/db";
import { buildLibrary } from "../content/library";
import { competenceProgress, planSession, recordItem, saveWord } from "./progress";
import { checkAnswer, modelAnswer, seededShuffle } from "./check";

const L = (en: string) => ({ en, bg: en });
const item = (id: string, comp: string, difficulty: number, extra: Record<string, unknown> = {}) => ({
  id, type: "cloze", band: "A1", skill: "grammar", competence: comp, objective: L("o"), difficulty,
  sentence: `${id} ___ x.`, accept: ["am", "'m"], explanation: L("e"), review: { author: "t", status: "approved" }, ...extra,
});
const lib = buildLibrary([
  {
    id: "p", version: 1, band: "A1",
    competences: [
      { id: "c.one", band: "A1", title: L("One"), canDo: L("x"), skills: ["grammar"] },
      { id: "c.two", band: "A1", title: L("Two"), canDo: L("x"), skills: ["grammar"], prerequisites: ["c.one"] },
    ],
    notes: [{ id: "n.one", competence: "c.one", title: L("t"), body: L("b"), examples: ["I am here."] }],
    glossary: [{ word: "be", pos: "verb", meaning: L("exist"), example: "I am here.", forms: ["am"], band: "A1" }],
    texts: [{ id: "t.one", competence: "c.one", band: "A1", title: "T", paragraphs: ["I am here."] }],
    items: [
      item("a", "c.one", -3), item("b", "c.one", -2), item("c", "c.one", -1),
      item("q", "c.one", -1, { textId: "t.one" }),
      item("z", "c.two", -1),
    ],
  },
]);

let n = 0;
const dbs: WaylineDB[] = [];
const fresh = () => { const d = new WaylineDB(`p-${++n}`); dbs.push(d); return d; };
afterEach(async () => { for (const d of dbs.splice(0)) await d.delete(); });
const profile = (p: Partial<Profile> = {}): Profile => ({ id: "me", createdAt: "x", explanationLanguage: "en", theme: "system", interests: [], seenNotes: [], dailyMinutes: 10, ...p });

describe("answer checking", () => {
  it("accepts any listed variant, ignoring case and final punctuation", () => {
    const i = lib.item.get("a")!;
    expect(checkAnswer(i, { kind: "text", value: " AM. " })).toBe(true);
    expect(checkAnswer(i, { kind: "text", value: "’m" })).toBe(true);
    expect(checkAnswer(i, { kind: "text", value: "is" })).toBe(false);
    expect(modelAnswer(i)).toBe("a am x.");
  });
  it("never shows tiles in the solved order", () => {
    expect(seededShuffle(["a", "b"], "k")).not.toEqual(["a", "b"]);
  });
});

describe("daily session plan", () => {
  it("starts a new learner on the first region with its note, easiest items first", async () => {
    const d = fresh();
    const plan = await planSession(profile(), lib, d);
    expect(plan.competenceId).toBe("c.one");
    expect(plan.steps[0]).toMatchObject({ kind: "note", noteId: "n.one", phase: "learn" });
    expect(plan.steps.map((s) => (s.kind === "item" ? s.item.id : s.kind))).toEqual(["note", "a", "b", "c", "text", "q"]);
  });

  it("adds the text and its question once half the region is practised, and skips seen notes", async () => {
    const d = fresh();
    await recordItem(lib.item.get("a")!, "first", "am", { database: d });
    await recordItem(lib.item.get("b")!, "first", "am", { database: d });
    const plan = await planSession(profile({ seenNotes: ["n.one"] }), lib, d);
    expect(plan.steps.map((s) => s.kind)).toEqual(["item", "text", "item"]);
  });

  it("locks the next region until its prerequisite is fully practised", async () => {
    const d = fresh();
    for (const id of ["a", "b", "c"]) await recordItem(lib.item.get(id)!, "first", "am", { database: d });
    expect((await competenceProgress(lib, d)).get("c.two")!.unlocked).toBe(false);
    await recordItem(lib.item.get("q")!, "hint", "is", { database: d });
    const progress = await competenceProgress(lib, d);
    expect(progress.get("c.two")!.unlocked).toBe(true);
    expect(progress.get("c.one")!.accuracy).toBeCloseTo(0.75);
    expect(progress.get("c.one")!.mastered).toBe(false);
    expect((await planSession(profile(), lib, d)).competenceId).toBe("c.two");
  });

  it("logs a mistake when a hint or the answer was needed, and resolves it later", async () => {
    const d = fresh();
    await recordItem(lib.item.get("a")!, "revealed", "is", { database: d });
    expect((await d.mistakes.toArray()).map((m) => m.resolved)).toEqual([false]);
    await recordItem(lib.item.get("a")!, "first", "am", { database: d });
    expect((await d.mistakes.toArray()).map((m) => m.resolved)).toEqual([true]);
  });

  it("puts due reviews first after a break, capped", async () => {
    const d = fresh();
    const past = new Date("2026-11-01T09:00:00Z");
    await recordItem(lib.item.get("a")!, "first", "am", { database: d, now: past });
    await saveWord(lib.lens.get("am")!, "I am here.", d, past);
    const plan = await planSession(profile(), lib, d, new Date("2026-11-10T09:00:00Z"));
    expect(plan.steps[0].kind).toMatch(/^review-/);
    expect(plan.steps.filter((s) => s.kind.startsWith("review")).length).toBe(2);
  });
});
