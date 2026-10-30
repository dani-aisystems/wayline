import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { WaylineDB } from "./db";
import { importBackup } from "./backup";
import { newCard } from "../lib/srs";

describe("upgrading an existing learner from schema v1", () => {
  it("keeps every v1 row and marks the old placement for a later diagnostic", async () => {
    const name = "migrate-v1";
    const v1 = new Dexie(name);
    v1.version(1).stores({
      profile: "id", cards: "id, kind, ref, fsrs.due", reviews: "++id, cardId", mastery: "competence",
      mistakes: "++id, itemId, competence", activity: "day",
    });
    const now = new Date("2026-10-20T09:00:00Z");
    await v1.table("profile").put({
      id: "me", createdAt: now.toISOString(), explanationLanguage: "bg", theme: "dark", interests: ["tech"],
      dailyMinutes: 20, placedBand: "A1", acceptedBand: "A1", onboardedAt: now.toISOString(), seenNotes: ["a1.hello.note-i-am"],
    });
    await v1.table("cards").put({ id: "item:a1.hello.be-am", kind: "item", ref: "a1.hello.be-am", fsrs: newCard(now), createdAt: now.toISOString() });
    await v1.table("mastery").put({ competence: "a1.hello", correct: 5, attempts: 6, hintsUsed: 1, updatedAt: now.toISOString() });
    await v1.table("activity").put({ day: "2026-10-20", minutes: 12, reviews: 3, newItems: 5 });
    v1.close();

    const v2 = new WaylineDB(name);
    const profile = await v2.profile.get("me");
    expect(profile).toMatchObject({ explanationLanguage: "bg", theme: "dark", acceptedBand: "A1", placementSource: "reading-check" });
    expect(profile!.seenNotes).toEqual(["a1.hello.note-i-am"]);
    expect(await v2.cards.count()).toBe(1);
    expect((await v2.mastery.get("a1.hello"))!.correct).toBe(5);
    expect(await v2.activity.count()).toBe(1);
    expect(await v2.xp.count()).toBe(0);
    expect(v2.verno).toBe(3);
    expect(await v2.examAttempts.count()).toBe(0);
    await v2.delete();
  });

  it("restores a version 1 backup file", async () => {
    const d = new WaylineDB("restore-v1");
    const v1Backup = {
      format: "wayline-backup", schemaVersion: 1, appVersion: "0.1.0", exportedAt: "2026-10-26T10:00:00Z",
      data: {
        profile: [{ id: "me", createdAt: "x", explanationLanguage: "en", theme: "system", interests: [], seenNotes: [] }],
        cards: [], reviews: [], mastery: [], mistakes: [], activity: [],
      },
    };
    expect(await importBackup(JSON.stringify(v1Backup), d)).toEqual({ ok: true, rows: 1 });
    await d.delete();
  });

  it("upgrades a v2 learner to v3 without touching progress or XP", async () => {
    const name = "migrate-v2";
    const v2 = new Dexie(name);
    v2.version(1).stores({ profile: "id", cards: "id, kind, ref, fsrs.due", reviews: "++id, cardId", mastery: "competence", mistakes: "++id, itemId, competence", activity: "day" });
    v2.version(2).stores({ placements: "++id, at", xp: "id, day, reason", achievements: "id" });
    const now = new Date("2026-10-25T09:00:00Z");
    await v2.table("profile").put({ id: "me", createdAt: now.toISOString(), explanationLanguage: "en", theme: "system", interests: [], seenNotes: [], goal: "exam", acceptedBand: "B2", placementSource: "diagnostic", onboardedAt: now.toISOString() });
    await v2.table("xp").put({ id: "item:x", amount: 5, reason: "lesson", at: now.toISOString(), day: "2026-10-25" });
    await v2.table("placements").add({ at: now.toISOString(), mode: "quick", responses: [], result: {} });
    v2.close();

    const v3 = new WaylineDB(name);
    expect(v3.verno).toBe(3);
    expect(await v3.profile.get("me")).toMatchObject({ goal: "exam", acceptedBand: "B2", placementSource: "diagnostic" });
    expect(await v3.xp.count()).toBe(1);
    expect(await v3.placements.count()).toBe(1);
    await v3.examAttempts.add({ exam: "c1-advanced", mode: "section", taskIds: ["t"], startedAt: now.toISOString(), timed: false, seconds: 0 });
    expect(await v3.examAttempts.count()).toBe(1);
    await v3.delete();
  });
});
