import { describe, expect, it } from "vitest";
import { BAND_CENTRE, DIAG_BANDS, DIAG_SKILLS, bandForAbility, itemDifficulty, type DiagItem } from "../content/diagnostic";
import { ALL_BANDS, estimate, nextItem, result, type PlacementState } from "./placement";

// Synthetic bank shaped like the real one: 18 items per band, all five skills, shifts spread within the band.
const L = { en: "x", bg: "х" };
const bank = new Map<string, DiagItem>();
for (const band of DIAG_BANDS) {
  for (let k = 0; k < 18; k++) {
    const id = `dx.${band.toLowerCase()}.${k}`;
    bank.set(id, {
      id, band, skill: DIAG_SKILLS[k % 5], objective: L, evidence: "synthetic item", shift: ((k % 5) - 2) / 4,
      explanation: L, topic: `topic-${k % 4}`, type: "choice", prompt: id, options: ["a", "b", "c", "d"], correct: 0,
      passage: "p",
    } as DiagItem);
  }
}

// Seeded RNG (mulberry32) so the simulation is reproducible.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

/** Simulate one learner. Real item difficulties differ from our priors by noise (model misfit). */
function simulate(trueTheta: number, priorMean: number, seed: number, misfit = 0.5) {
  const r = rng(seed);
  const trueB = new Map([...bank.values()].map((i) => [i.id, itemDifficulty(i) + gauss(r) * misfit]));
  const s: PlacementState = { mode: "quick", priorMean, responses: [], skipSkills: [] };
  for (let item = nextItem(bank, s); item; item = nextItem(bank, s)) {
    const pr = 1 / (1 + Math.exp(-(trueTheta - trueB.get(item.id)!)));
    s.responses.push({ itemId: item.id, correct: r() < pr });
  }
  return result(bank, s);
}

const idx = (b: string) => ALL_BANDS.indexOf(b as (typeof ALL_BANDS)[number]);

describe("ability estimate", () => {
  it("stays finite when every answer is right", () => {
    const e = estimate(Array.from({ length: 10 }, () => ({ b: 3.75, correct: true })), 0);
    expect(e.theta).toBeGreaterThan(3.75);
    expect(e.theta).toBeLessThan(6);
  });
  it("maps abilities to bands at the edges", () => {
    expect(bandForAbility(-5)).toBe("preA1");
    expect(bandForAbility(BAND_CENTRE.B1)).toBe("B1");
    expect(bandForAbility(5)).toBe("C2");
  });
});

describe("adaptive placement (simulated learners)", () => {
  const runs = 60;
  for (const band of DIAG_BANDS) {
    it(`places ${band} learners within one band in ≥ 85% of runs, from a neutral start`, () => {
      let within1 = 0, exact = 0, items = 0;
      for (let k = 0; k < runs; k++) {
        const res = simulate(BAND_CENTRE[band], -0.8, 1000 * idx(band) + k);
        const d = Math.abs(idx(res.band) - idx(band));
        if (d <= 1) within1++;
        if (d === 0) exact++;
        items += res.items;
      }
      console.info(`${band}: exact ${Math.round((exact / runs) * 100)}%, within one band ${Math.round((within1 / runs) * 100)}%, mean items ${(items / runs).toFixed(1)}`);
      expect(within1 / runs).toBeGreaterThanOrEqual(0.85);
      expect(exact / runs).toBeGreaterThanOrEqual(0.5);
    });
  }

  it("reaches C2 for a strong learner even if they rated themselves low", () => {
    const res = simulate(4.2, SELF_LOW, 7);
    expect(["C1", "C2"]).toContain(res.band);
  });

  it("finds a beginner who over-rated themselves", () => {
    const res = simulate(-4.2, 2.3, 9);
    expect(["preA1", "A1"]).toContain(res.band);
  });

  it("uses 12–30 items and mixes all five skills", () => {
    const res = simulate(0.75, -0.8, 3);
    expect(res.items).toBeGreaterThanOrEqual(12);
    expect(res.items).toBeLessThanOrEqual(30);
    expect(res.skills.filter((k) => k.items >= 2).length).toBe(5);
  });

  it("reports skills with too little evidence as not measured", () => {
    const s: PlacementState = { mode: "quick", priorMean: 0, responses: [{ itemId: "dx.b1.0", correct: true }], skipSkills: [] };
    expect(result(bank, s).skills.find((k) => k.skill === "grammar")!.band).toBeNull();
  });

  it("skips listening when the device has no voice", () => {
    const s: PlacementState = { mode: "quick", priorMean: 0, responses: [], skipSkills: ["listening"] };
    for (let item = nextItem(bank, s); item; item = nextItem(bank, s)) {
      expect(item.skill).not.toBe("listening");
      s.responses.push({ itemId: item.id, correct: true });
    }
    expect(result(bank, s).skipped).toEqual(["listening"]);
  });

  it("is deterministic for the same answers", () => {
    const a = simulate(0, 0, 42), b = simulate(0, 0, 42);
    expect(a).toEqual(b);
  });
});

const SELF_LOW = -2.2;
