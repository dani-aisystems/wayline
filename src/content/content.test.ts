import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validatePacks } from "./validate";
import { normalizeAnswer } from "./schema";

const dir = new URL("./packs/", import.meta.url);
const raw = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((file) => ({ file, data: JSON.parse(readFileSync(new URL(file, dir), "utf8")) }));

describe("shipped content packs", () => {
  const { packs, issues } = validatePacks(raw);

  it("has at least one pack", () => expect(packs.length).toBeGreaterThan(0));

  it("has no validation errors", () => {
    const errors = issues.filter((i) => i.level === "error");
    expect(errors, errors.map((e) => `${e.where}: ${e.message}`).join("\n")).toEqual([]);
  });

  it("prints warnings for the editorial log", () => {
    for (const w of issues.filter((i) => i.level === "warning")) console.info(`[content warning] ${w.where}: ${w.message}`);
  });
});

const goodPack = () => ({
  id: "t",
  version: 1,
  band: "A1",
  competences: [{ id: "t.a", band: "A1", title: { en: "A" }, canDo: { en: "A" }, skills: ["grammar"] }],
  items: [
    {
      id: "t.1",
      type: "cloze",
      band: "A1",
      skill: "grammar",
      competence: "t.a",
      objective: { en: "x" },
      difficulty: 0,
      sentence: "I ___ here.",
      accept: ["am"],
      explanation: { en: "x", bg: "х" },
      review: { author: "t", status: "approved" },
    },
  ],
});

describe("content validator catches mistakes", () => {
  it("accepts a good pack", () => {
    expect(validatePacks([{ file: "g", data: goodPack() }]).issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("rejects a cloze without a gap", () => {
    const p = goodPack();
    p.items[0].sentence = "I am here.";
    expect(validatePacks([{ file: "g", data: p }]).issues.some((i) => i.message.includes("exactly one ___"))).toBe(true);
  });

  it("rejects an explanation missing English", () => {
    const p = goodPack() as any;
    p.items[0].explanation = { bg: "х" };
    expect(validatePacks([{ file: "g", data: p }]).issues.some((i) => i.level === "error")).toBe(true);
  });

  it("rejects an unsupported explanation language", () => {
    const p = goodPack() as any;
    p.items[0].explanation = { en: "x", xx: "y" };
    expect(validatePacks([{ file: "g", data: p }]).issues.some((i) => i.message.includes("may only use"))).toBe(true);
  });

  it("rejects unknown competences and prerequisite cycles", () => {
    const p = goodPack() as any;
    p.items[0].competence = "t.missing";
    p.competences.push({ id: "t.b", band: "A1", title: { en: "B" }, canDo: { en: "B" }, skills: ["grammar"], prerequisites: ["t.c"] });
    p.competences.push({ id: "t.c", band: "A1", title: { en: "C" }, canDo: { en: "C" }, skills: ["grammar"], prerequisites: ["t.b"] });
    const msgs = validatePacks([{ file: "g", data: p }]).issues.map((i) => i.message);
    expect(msgs.some((m) => m.includes("unknown competence"))).toBe(true);
    expect(msgs.some((m) => m.includes("cycle"))).toBe(true);
  });

  it("rejects choice items whose answer index is out of range", () => {
    const p = goodPack() as any;
    p.items[0] = { ...p.items[0], type: "choice", prompt: "Pick", options: ["a", "b"], correct: 2 };
    delete p.items[0].sentence;
    delete p.items[0].accept;
    expect(validatePacks([{ file: "g", data: p }]).issues.some((i) => i.level === "error")).toBe(true);
  });

  it("warns when a Bulgarian explanation is missing", () => {
    const p = goodPack();
    p.items[0].explanation = { en: "x" } as any;
    expect(validatePacks([{ file: "g", data: p }]).issues.some((i) => i.message.includes("missing bg"))).toBe(true);
  });
});

describe("answer normalisation", () => {
  it("ignores case, extra spaces, curly quotes and final punctuation", () => {
    expect(normalizeAnswer("  I’M   here! ")).toBe("i'm here");
  });
});
