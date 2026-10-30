import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateExamPacks } from "./validate";
import { EXAMS, gradeFor, overallScale, toScale } from "./spec";

const dir = new URL("./packs/", import.meta.url);
const packs = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));

describe("exam content", () => {
  it("matches the official task specifications", () => {
    const { issues } = validateExamPacks(packs);
    const errors = issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.message}`);
    expect(errors).toEqual([]);
  });
  it("has no answer-key patterns a candidate could exploit", () => {
    const { issues } = validateExamPacks(packs);
    expect(issues.filter((i) => i.level === "warning" && /longest|option [ABCD] is correct/.test(i.message)).map((i) => i.message)).toEqual([]);
  });
});

describe("Cambridge English Scale estimates", () => {
  it("hit the official boundary points exactly", () => {
    for (const exam of Object.values(EXAMS)) for (const row of exam.conversion) for (const [skill, raw] of Object.entries(row.raw))
      expect(toScale(exam.id, skill as never, raw)).toBe(row.scale);
  });
  it("top out at the highest reported score and rise with marks", () => {
    expect(toScale("c1-advanced", "reading", 50)).toBe(210);
    expect(toScale("b2-first", "listening", 30)).toBe(190);
    let last = 0;
    for (let r = 0; r <= 28; r++) { const s = toScale("b2-first", "useOfEnglish", r); expect(s).toBeGreaterThanOrEqual(last); last = s; }
  });
  it("average five skills and grade like the statement of results", () => {
    expect(overallScale({ reading: 173, useOfEnglish: 168, writing: 168, listening: 178, speaking: 177 })).toBe(173);
    expect(gradeFor("b2-first", 173)?.label).toBe("Grade B");
    expect(gradeFor("c1-advanced", 196)?.label).toBe("Grade B");
    expect(gradeFor("c1-advanced", 205)?.cefr).toBe("C2");
    expect(overallScale({ reading: 180 })).toBeNull();
  });
});
