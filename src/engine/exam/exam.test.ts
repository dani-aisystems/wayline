import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WaylineDB } from "../../db/db";
import { buildExamLibrary } from "../../content/exams";
import type { ExamTask } from "../../content/exams/schema";
import { markKwt, scoreTask } from "./scoring";
import { finishAttempt, startAttempt } from "./record";
import { readiness } from "./readiness";
import { recommend, roadmap } from "./plan";
import { checkWriting } from "./writing";

const why = { en: "Because.", bg: "Защото." };
const mcCloze = (id: string, set: string, tag = "uoe.collocations"): ExamTask => ({
  id, exam: "c1-advanced", paper: "reading", part: 1, set, title: "t", topic: "t", instructions: "i", status: "draft", kind: "mc-cloze",
  text: Array.from({ length: 8 }, (_, i) => `word {{${i + 1}}}`).join(" "),
  questions: Array.from({ length: 8 }, (_, i) => ({ n: i + 1, options: ["make", "do", "take", "have"], correct: i % 4, tag, why })),
});
const kwt: ExamTask = {
  id: "c1.kwt", exam: "c1-advanced", paper: "reading", part: 4, set: "drill", title: "t", topic: "t", instructions: "i", status: "draft", kind: "kwt",
  questions: Array.from({ length: 6 }, (_, i) => ({
    n: 25 + i, first: "I regret not studying harder.", keyword: "WISH", before: "I", after: "harder.",
    accept: ["wish I had studied"], chunks: [["wish i had"], ["studied"]] as [string[], string[]], tag: "uoe.wish-regret", why,
  })),
};
const lib = buildExamLibrary([
  { id: "fixture", tasks: [mcCloze("c1.m1.p1", "mock-1"), mcCloze("c1.m2.p1", "mock-2"), mcCloze("c1.d.p1", "drill"), kwt], lessons: [{ tag: "uoe.collocations", title: why, explanation: why, examples: ["make a decision", "do research"] }] },
]);

describe("marking", () => {
  it("marks key word transformations in two halves, like Cambridge", () => {
    const q = (kwt as Extract<ExamTask, { kind: "kwt" }>).questions[0];
    expect(markKwt("wish I had studied", q, [3, 6])).toBe(2);
    expect(markKwt("wish I had worked", q, [3, 6])).toBe(1); // first half right
    expect(markKwt("regret I had studied", q, [3, 6])).toBe(0); // key word missing
    expect(markKwt("really do wish that I had studied", q, [3, 6])).toBe(0); // 7 words: too long
    expect(markKwt("", q, [3, 6])).toBe(0);
  });
  it("scores multiple choice by option index and reports the key", () => {
    const r = scoreTask(lib.tasks.get("c1.m1.p1")!, { 1: "0", 2: "3" });
    expect(r[0]).toMatchObject({ correct: true, marks: 1, key: "make" });
    expect(r[1]).toMatchObject({ correct: false, marks: 0, given: "have", key: "do" });
    expect(r[2]).toMatchObject({ given: "", marks: 0 });
  });
});

describe("attempts, readiness and revision", () => {
  let database: WaylineDB;
  beforeEach(() => { database = new WaylineDB(`exam-${Math.random()}`); });
  afterEach(() => database.delete());

  it("store evidence once, award XP once, and survive a double submit", async () => {
    const task = lib.tasks.get("c1.m1.p1")!;
    const id = await startAttempt({ exam: "c1-advanced", mode: "section", taskIds: [task.id], timed: false }, database);
    const responses = { [task.id]: { 1: "0", 2: "1", 3: "0" } };
    const a = await finishAttempt(id, [task], responses, { seconds: 240 }, database);
    const b = await finishAttempt(id, [task], responses, { seconds: 240 }, database);
    expect(a.skills.reading).toEqual({ raw: 2, max: 8 }); // q1 and q2 right, q3 wrong
    expect(a.xp).toBe(20);
    expect(b.xp).toBe(0);
    expect(await database.examAnswers.count()).toBe(8);
    expect((await database.examAnswers.toArray())[0].seconds).toBe(30);
  });

  it("estimate only skills with enough evidence, and point weak tags to theory plus an unseen task", async () => {
    const task = lib.tasks.get("c1.m1.p1")!;
    const id = await startAttempt({ exam: "c1-advanced", mode: "section", taskIds: [task.id], timed: false }, database);
    await finishAttempt(id, [task], { [task.id]: { 1: "0" } }, { seconds: 100 }, database); // 1 of 8
    const r = await readiness("c1-advanced", 185, database);
    expect(r.skills.reading.scale).not.toBeNull();
    expect(r.skills.reading.low!).toBeLessThan(r.skills.reading.scale!);
    expect(r.skills.listening.scale).toBeNull(); // no evidence → no number
    expect(r.overall).toBeNull();
    const recs = recommend(r, lib);
    expect(recs[0]).toMatchObject({ tag: "uoe.collocations", lesson: true, taskId: "c1.d.p1" }); // drill, not the seen task or the kept-back mock
  });

  it("plan starts with the diagnostic and moves to final revision near the exam", async () => {
    const r = await readiness("c1-advanced", undefined, database);
    const now = new Date("2026-11-01T10:00:00");
    const far = roadmap({ exam: "c1-advanced", date: "2027-03-01", setAt: now.toISOString() }, r, new Set(), 30, lib, now);
    expect(far.current).toBe("diagnostic");
    expect(far.today[0]).toEqual({ kind: "diagnostic" });
    expect(far.phases.find((p) => p.id === "final")!.weeks).toBeGreaterThanOrEqual(2);
    const withDiag = { ...r, attempts: [{ exam: "c1-advanced" as const, mode: "diagnostic" as const, taskIds: [], startedAt: now.toISOString(), finishedAt: now.toISOString(), timed: false, seconds: 1 }] };
    expect(roadmap({ exam: "c1-advanced", date: "2026-11-10", setAt: "" }, withDiag, new Set(), 30, lib, now).current).toBe("final");
  });
});

describe("writing indicators", () => {
  const task = {
    id: "w", exam: "b2-first", paper: "writing", part: 1, set: "drill", title: "t", topic: "t", instructions: "i", status: "draft", kind: "writing",
    genre: "essay", prompt: "p", register: "neutral", model: "m", modelNotes: why,
    points: [{ label: "cost", keywords: ["cost", "expensive"] }, { label: "health", keywords: ["health", "healthy"] }],
  } as Extract<ExamTask, { kind: "writing" }>;
  it("count observable features honestly and give low indicators to very short answers", () => {
    const short = checkWriting(task, "Cars are bad.");
    expect(short.words).toBe(3);
    expect(Math.max(...Object.values(short.indicator))).toBeLessThanOrEqual(1);
    const text = `Many people believe that cycling to work is better than driving. In my opinion, this is true for several reasons.\n\nFirstly, cars are expensive to run, whereas a bicycle costs very little once you have bought it. Moreover, fuel prices keep rising.\n\nSecondly, cycling is healthy. People who ride every day are fitter, which means they are less likely to fall ill. However, cycling in heavy traffic can be dangerous if cities do not build safe lanes.\n\nIn conclusion, although cycling is not possible for everyone, I believe that most people would benefit from leaving the car at home.`;
    const good = checkWriting(task, text);
    expect(good.points.every((p) => p.found)).toBe(true);
    expect(good.paragraphs).toBe(4);
    expect(good.linkers).toEqual(expect.arrayContaining(["whereas", "moreover", "however", "in conclusion"]));
    expect(good.indicator.organisation).toBeGreaterThanOrEqual(4);
    expect(good.indicator.content).toBeGreaterThanOrEqual(4);
  });
});
