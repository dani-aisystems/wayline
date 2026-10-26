import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { WaylineDB, type Profile } from "../db/db";
import { buildLibrary } from "../content/library";
import { planSession, recordItem } from "./progress";
import { learnerModel } from "./learner";

const L = (en: string) => ({ en, bg: en });
const base = (id: string, comp: string, skill: string, d: number, extra: Record<string, unknown> = {}) => ({
  id, band: "B1", skill, competence: comp, objective: L("o"), difficulty: d, explanation: L("e"),
  review: { author: "t", status: "approved" }, ...extra,
});
const cloze = (id: string, comp: string, skill: string, d: number, structures: string[] = []) =>
  base(id, comp, skill, d, { type: "cloze", sentence: `${id} ___ x.`, accept: ["a"], structures });
const lib = buildLibrary([
  {
    id: "p", version: 1, band: "B1",
    competences: [
      { id: "b1.grammar", band: "B1", title: L("G"), canDo: L("x"), skills: ["grammar"] },
      { id: "b1.talk", band: "B1", title: L("T"), canDo: L("x"), skills: ["speaking", "listening"] },
      { id: "a1.basic", band: "A1", title: L("A"), canDo: L("x"), skills: ["grammar"] },
    ],
    items: [
      cloze("g1", "b1.grammar", "grammar", -1, ["conditionals"]), cloze("g2", "b1.grammar", "grammar", -0.9, ["conditionals"]),
      cloze("g3", "b1.grammar", "grammar", -0.8, ["articles"]), cloze("g4", "b1.grammar", "grammar", -0.7),
      base("s1", "b1.talk", "speaking", -1, { type: "speak", mode: "repeat", prompt: "Say it", target: "Let's meet at six.", model: "Let's meet at six." }),
      base("l1", "b1.talk", "listening", -0.9, { type: "listen", audio: "Train at six.", question: "When?", options: ["six", "seven"], correct: 0 }),
      cloze("a1", "a1.basic", "grammar", -3),
    ],
  },
]);

let n = 0;
const dbs: WaylineDB[] = [];
const fresh = () => { const d = new WaylineDB(`pers-${++n}`); dbs.push(d); return d; };
afterEach(async () => { for (const d of dbs.splice(0)) await d.delete(); });
const profile = (p: Partial<Profile>): Profile => ({ id: "me", createdAt: "x", explanationLanguage: "en", theme: "system", interests: [], seenNotes: [], dailyMinutes: 20, acceptedBand: "B1", ...p });

describe("personalised daily plan", () => {
  it("starts at the accepted level, never with A1 material for a B1 learner", async () => {
    const plan = await planSession(profile({}), lib, fresh());
    expect(plan.steps.every((s) => !("item" in s) || s.item.band !== "A1")).toBe(true);
  });

  it("chooses different regions for a speaking-goal learner and an exam-goal learner", async () => {
    const speaker = await planSession(profile({ goal: "everyday", focusSkills: ["speaking"] }), lib, fresh());
    const examiner = await planSession(profile({ goal: "exam", focusSkills: ["grammar"] }), lib, fresh());
    expect(speaker.competenceId).toBe("b1.talk");
    expect(examiner.competenceId).toBe("b1.grammar");
    expect(speaker.reasons.find((r) => r.kind === "new")).toMatchObject({ because: "priority", skill: "speaking" });
  });

  it("reinforces repeated mistakes on the same topic and says which topic", async () => {
    const d = fresh();
    await recordItem(lib.item.get("g1")!, "revealed", "x", { database: d });
    await recordItem(lib.item.get("g2")!, "hint", "x", { database: d });
    const model = await learnerModel(profile({}), lib, d);
    expect(model.weakTags[0]).toMatchObject({ tag: "conditionals", count: 2 });
    const plan = await planSession(profile({ goal: "everyday", focusSkills: ["speaking"] }), lib, d);
    expect(plan.reasons).toContainEqual({ kind: "reinforce", tag: "conditionals", count: 2 });
    expect(plan.steps.filter((s) => s.phase === "reinforce").map((s) => "item" in s && s.item.id)).toEqual(["g1", "g2"]);
  });

  it("adds a listening or speaking task for a grammar-focused learner in a 20-minute session", async () => {
    const plan = await planSession(profile({ goal: "exam" }), lib, fresh());
    expect(plan.steps.some((s) => "item" in s && ["speak", "listen", "dialogue"].includes(s.item.type))).toBe(true);
  });

  it("marks a skill weak from real practice once there is enough evidence", async () => {
    const d = fresh();
    for (const id of ["g1", "g2", "g3", "g4"]) await recordItem(lib.item.get(id)!, "revealed", "x", { database: d });
    await recordItem(lib.item.get("g1")!, "revealed", "x", { database: d });
    const model = await learnerModel(profile({}), lib, d);
    expect(model.skills.grammar.accuracy).toBe(0);
    expect(model.priorities[0]).toEqual({ skill: "grammar", reason: "weak-practice" });
    expect(model.skills.speaking.accuracy).toBeNull();
  });
});
