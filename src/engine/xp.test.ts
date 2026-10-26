import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { WaylineDB } from "../db/db";
import { award, awardForItem, checkAchievements, levelFor, xpSummary, XP } from "./xp";
import { buildLibrary } from "../content/library";

const L = (en: string) => ({ en, bg: en });
const lib = buildLibrary([{
  id: "p", version: 1, band: "A1",
  competences: [{ id: "c", band: "A1", title: L("C"), canDo: L("x"), skills: ["speaking"] }],
  items: [{ id: "s", type: "speak", mode: "repeat", prompt: "p", target: "Hello there.", model: "Hello there.", band: "A1", skill: "speaking", competence: "c", objective: L("o"), difficulty: -3, explanation: L("e"), review: { author: "t", status: "approved" } }],
}]);
const item = lib.item.get("s")!;

let n = 0;
const dbs: WaylineDB[] = [];
const fresh = () => { const d = new WaylineDB(`xp-${++n}`); dbs.push(d); return d; };
afterEach(async () => { for (const d of dbs.splice(0)) await d.delete(); });

describe("XP ledger", () => {
  it("never pays the same key twice (reload, double click, repeated request)", async () => {
    const d = fresh();
    expect(await award("session:2026-11-02:abc", XP.session, "lesson", d)).toBe(true);
    expect(await award("session:2026-11-02:abc", XP.session, "lesson", d)).toBe(false);
    await Promise.all([award("plan:2026-11-02", XP.plan, "plan", d), award("plan:2026-11-02", XP.plan, "plan", d)]);
    expect((await xpSummary(d)).total).toBe(XP.session + XP.plan);
  });

  it("pays a speaking item once per day, and a new item only the first time", async () => {
    const d = fresh();
    const day1 = new Date("2026-11-02T10:00:00");
    expect(await awardForItem(item, true, d, day1)).toBe(XP.item + XP.speaking);
    expect(await awardForItem(item, false, d, day1)).toBe(XP.review); // reviewed again same day: review only
    expect(await awardForItem(item, false, d, day1)).toBe(0); // farming the same item: nothing
    expect(await awardForItem(item, false, d, new Date("2026-11-03T10:00:00"))).toBe(XP.review + XP.speaking);
  });

  it("levels grow gently and are separate from CEFR", () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, span: 100 });
    expect(levelFor(100)).toEqual({ level: 2, into: 0, span: 200 });
    expect(levelFor(350).level).toBe(3);
  });

  it("stores each achievement once", async () => {
    const d = fresh();
    await awardForItem(item, true, d);
    expect(await checkAchievements(lib, d)).toContain("first-speaking");
    expect(await checkAchievements(lib, d)).toEqual([]);
  });
});
