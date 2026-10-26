import { BAND_FLOOR, DIAG_BANDS, DIAG_SKILLS, bandForAbility, itemDifficulty, type DiagBand, type DiagItem, type DiagSkill } from "../content/diagnostic";

/**
 * Adaptive placement on a Rasch (1-parameter logistic) scale.
 *
 * - Ability is estimated by EAP (expected a posteriori) over a grid, with a normal prior.
 *   EAP stays finite when every answer is right or wrong, unlike maximum likelihood.
 * - The next item is the unused one whose difficulty is closest to the current estimate
 *   (where a Rasch item is most informative), rotating through skills so evidence is balanced.
 * - The test stops when the estimate is precise enough, or clearly inside one band,
 *   or the item limit is reached.
 * Difficulties are rule-based priors (band centre + shift), so results are estimates, not certificates.
 */

export type Response = { itemId: string; correct: boolean };
export type Mode = "quick" | "extended";

export const LIMITS: Record<Mode, { min: number; max: number; se: number }> = {
  quick: { min: 12, max: 30, se: 0.45 },
  extended: { min: 24, max: 45, se: 0.33 },
};

/** Starting estimate from the learner's own description (sets the prior mean only). */
export const SELF_RATING_PRIOR: Record<string, number> = {
  "few-words": -3.5,
  basic: -2.2,
  conversations: -0.7,
  comfortable: 0.8,
  fluent: 2.3,
  unsure: -0.8,
};

const GRID: number[] = Array.from({ length: 241 }, (_, i) => -6 + i * 0.05);
const p = (theta: number, b: number) => 1 / (1 + Math.exp(-(theta - b)));

export type Estimate = { theta: number; se: number; n: number };

export function estimate(responses: Array<{ b: number; correct: boolean }>, priorMean: number, priorSd = 1.6): Estimate {
  let wsum = 0;
  let m1 = 0;
  let m2 = 0;
  // Work in logs to avoid underflow on long tests.
  const logs = GRID.map((t) => {
    let l = -((t - priorMean) ** 2) / (2 * priorSd ** 2);
    for (const r of responses) {
      const pr = p(t, r.b);
      l += Math.log(r.correct ? pr : 1 - pr);
    }
    return l;
  });
  const max = Math.max(...logs);
  GRID.forEach((t, i) => {
    const w = Math.exp(logs[i] - max);
    wsum += w;
    m1 += w * t;
    m2 += w * t * t;
  });
  const theta = m1 / wsum;
  const se = Math.sqrt(Math.max(m2 / wsum - theta * theta, 1e-6));
  return { theta, se, n: responses.length };
}

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export type PlacementState = {
  mode: Mode;
  priorMean: number;
  responses: Response[];
  /** Skills the device can't present (e.g. listening with no voice). */
  skipSkills: DiagSkill[];
};

export function withDifficulty(bank: Map<string, DiagItem>, responses: Response[]) {
  return responses.flatMap((r) => {
    const i = bank.get(r.itemId);
    return i ? [{ b: itemDifficulty(i), correct: r.correct, item: i }] : [];
  });
}

export function current(bank: Map<string, DiagItem>, s: PlacementState): Estimate {
  return estimate(withDifficulty(bank, s.responses), s.priorMean);
}

/** Pick the next item, or null when the test should stop. Deterministic for a given state. */
export function nextItem(bank: Map<string, DiagItem>, s: PlacementState): DiagItem | null {
  if (shouldStop(bank, s)) return null;
  const used = new Set(s.responses.map((r) => r.itemId));
  const est = current(bank, s);
  const pool = [...bank.values()].filter((i) => !used.has(i.id) && !s.skipSkills.includes(i.skill));
  if (!pool.length) return null;

  const counts = new Map<DiagSkill, number>(DIAG_SKILLS.map((k) => [k, 0]));
  for (const r of s.responses) {
    const i = bank.get(r.itemId);
    if (i) counts.set(i.skill, (counts.get(i.skill) ?? 0) + 1);
  }
  const available = DIAG_SKILLS.filter((k) => pool.some((i) => i.skill === k));
  // Least-tested skill first; ties broken by a fixed order so the sequence is reproducible.
  const skill = [...available].sort((a, b) => counts.get(a)! - counts.get(b)! || DIAG_SKILLS.indexOf(a) - DIAG_SKILLS.indexOf(b))[0];
  const candidates = pool.filter((i) => i.skill === skill);
  // The first few items probe more widely so a wrong prior is corrected quickly.
  const probe = s.responses.length < 4 ? [0, 1.2, -1.2, 0.6][s.responses.length] : 0;
  const target = est.theta + probe;
  return [...candidates].sort(
    (a, b) => Math.abs(itemDifficulty(a) - target) - Math.abs(itemDifficulty(b) - target) || hash(a.id) - hash(b.id),
  )[0];
}

export function shouldStop(bank: Map<string, DiagItem>, s: PlacementState): boolean {
  const lim = LIMITS[s.mode];
  const n = s.responses.length;
  if (n >= lim.max) return true;
  if (n < lim.min) return false;
  const est = current(bank, s);
  if (est.se <= lim.se) return true;
  // Clearly inside one band: the 95% interval doesn't cross a band edge.
  const edges = Object.values(BAND_FLOOR);
  const nearest = Math.min(...edges.map((e) => Math.abs(est.theta - e)));
  return nearest > 1.96 * est.se;
}

export type SkillResult = { skill: DiagSkill; band: DiagBand | "preA1" | null; theta: number | null; items: number; correct: number };

export type PlacementResult = {
  theta: number;
  se: number;
  band: DiagBand | "preA1";
  range: [DiagBand | "preA1", DiagBand | "preA1"];
  recommended: DiagBand | "preA1";
  confidence: "high" | "medium" | "low";
  skills: SkillResult[];
  weakTopics: Array<{ topic: string; skill: DiagSkill; missed: number }>;
  strongSkills: DiagSkill[];
  weakSkills: DiagSkill[];
  items: number;
  mode: Mode;
  skipped: DiagSkill[];
};

/** Fewer than this many items in a skill → "not enough evidence" rather than a band. */
export const MIN_SKILL_ITEMS = 3;

export function result(bank: Map<string, DiagItem>, s: PlacementState): PlacementResult {
  const scored = withDifficulty(bank, s.responses);
  const est = estimate(scored, s.priorMean);
  const lo = bandForAbility(est.theta - 1.28 * est.se);
  const hi = bandForAbility(est.theta + 1.28 * est.se);

  const skills: SkillResult[] = DIAG_SKILLS.map((skill) => {
    const own = scored.filter((r) => r.item.skill === skill);
    const correct = own.filter((r) => r.correct).length;
    if (own.length < MIN_SKILL_ITEMS) return { skill, band: null, theta: null, items: own.length, correct };
    // Shrink each skill toward the overall estimate: few items shouldn't swing a skill wildly.
    const e = estimate(own, est.theta, 1.0);
    return { skill, band: bandForAbility(e.theta), theta: e.theta, items: own.length, correct };
  });

  const measured = skills.filter((k) => k.theta !== null);
  const strongSkills = measured.filter((k) => k.theta! >= est.theta + 0.5).map((k) => k.skill);
  const weakSkills = measured.filter((k) => k.theta! <= est.theta - 0.5).map((k) => k.skill);

  // Topics missed on items the learner "should" know (at or below their level).
  const misses = new Map<string, { topic: string; skill: DiagSkill; missed: number }>();
  for (const r of scored) {
    if (r.correct || r.b > est.theta + 0.4) continue;
    const key = r.item.topic;
    const m = misses.get(key) ?? { topic: key, skill: r.item.skill, missed: 0 };
    m.missed += 1;
    misses.set(key, m);
  }
  const weakTopics = [...misses.values()].sort((a, b) => b.missed - a.missed).slice(0, 5);

  // Start conservatively: slightly below the estimate, so the first lessons build confidence.
  const recommended = bandForAbility(est.theta - 0.35 * est.se);
  const confidence = est.se <= 0.4 ? "high" : est.se <= 0.6 ? "medium" : "low";
  return {
    theta: est.theta,
    se: est.se,
    band: bandForAbility(est.theta),
    range: [lo, hi],
    recommended,
    confidence,
    skills,
    weakTopics,
    strongSkills,
    weakSkills,
    items: s.responses.length,
    mode: s.mode,
    skipped: s.skipSkills,
  };
}

export const ALL_BANDS = ["preA1", ...DIAG_BANDS] as const;
