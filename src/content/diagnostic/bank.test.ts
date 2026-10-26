import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DIAG_BANDS, DIAG_SKILLS, DiagBank } from "../diagnostic";
import { normalizeAnswer } from "../schema";

const raw = JSON.parse(readFileSync(new URL("./bank.json", import.meta.url), "utf8"));

describe("diagnostic item bank", () => {
  const parsed = DiagBank.safeParse(raw);

  it("matches the DiagBank schema", () => {
    expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 10), null, 2)).toBe(true);
  });

  const items = parsed.success ? parsed.data.items : [];

  it("has at least 15 items per band, covering all five skills", () => {
    const table: Record<string, Record<string, number>> = {};
    for (const band of DIAG_BANDS) {
      const inBand = items.filter((i) => i.band === band);
      expect(inBand.length, band).toBeGreaterThanOrEqual(15);
      table[band] = Object.fromEntries(DIAG_SKILLS.map((s) => [s, inBand.filter((i) => i.skill === s).length]));
      for (const skill of DIAG_SKILLS) expect(table[band][skill], `${band} ${skill}`).toBeGreaterThan(0);
      table[band].total = inBand.length;
    }
    console.table(table);
    console.log(`total items: ${items.length} (choice ${items.filter((i) => i.type === "choice").length}, cloze ${items.filter((i) => i.type === "cloze").length})`);
  });

  it("has unique ids", () => {
    const ids = items.map((i) => i.id);
    expect(ids.filter((id, n) => ids.indexOf(id) !== n)).toEqual([]);
  });

  it("has no duplicate prompts or sentences", () => {
    const keys = items.map((i) => normalizeAnswer(`${i.passage ?? ""}|${i.type === "choice" ? i.prompt : i.sentence}`));
    expect(keys.filter((k, n) => keys.indexOf(k) !== n)).toEqual([]);
  });

  it("spreads the correct option across positions (no index > 40%)", () => {
    const choice = items.filter((i) => i.type === "choice");
    const counts = [0, 1, 2, 3].map((n) => choice.filter((i) => i.correct === n).length);
    console.log(`correct index distribution: ${counts.join(" / ")} of ${choice.length}`);
    for (const c of counts) expect(c / choice.length).toBeLessThanOrEqual(0.4);
  });

  it("has well-formed cloze items", () => {
    for (const i of items) {
      if (i.type !== "cloze") continue;
      const accepted = i.accept.map(normalizeAnswer);
      expect(new Set(accepted).size, i.id).toBe(accepted.length);
      // The primary answer is a single word; later entries may be spelling variants (e.g. "cannot").
      expect(accepted[0].split(" ").length, `${i.id}: single-word answer`).toBe(1);
    }
  });

  it("gives a Bulgarian version of every learner-facing text", () => {
    for (const i of items) {
      expect((i.objective as Record<string, string>).bg, i.id).toBeTruthy();
      expect((i.explanation as Record<string, string>).bg, i.id).toBeTruthy();
    }
  });
});
