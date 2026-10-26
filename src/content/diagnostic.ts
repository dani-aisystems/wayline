import { z } from "zod";
import { LocalizedText } from "./schema";

/**
 * Placement item bank. Separate from lesson content so learners are never placed with items
 * they have already practised, and so items can be recalibrated without touching lessons.
 */
export const DIAG_BANDS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const DiagBand = z.enum(DIAG_BANDS);
export type DiagBand = z.infer<typeof DiagBand>;

export const DIAG_SKILLS = ["grammar", "vocabulary", "reading", "listening", "functional"] as const;
export const DiagSkill = z.enum(DIAG_SKILLS);
export type DiagSkill = z.infer<typeof DiagSkill>;

const Id = z.string().regex(/^dx\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "diagnostic ids start with dx.");

const Base = z.object({
  id: Id,
  band: DiagBand,
  skill: DiagSkill,
  /** What competence this item gives evidence of (shown on the results screen when missed). */
  objective: LocalizedText,
  /** Why a correct answer is evidence of this level — for reviewers, not learners. */
  evidence: z.string().min(10),
  /** Optional fine adjustment within the band, −0.5 (easier) … +0.5 (harder). */
  shift: z.number().min(-0.5).max(0.5).default(0),
  /** Reading: a short passage shown above the question. Listening: the text spoken aloud (hidden until answered). */
  passage: z.string().min(1).optional(),
  explanation: LocalizedText,
  /** Grammar/vocab topic tags, used to name weaknesses (e.g. "conditionals", "articles"). */
  topic: z.string().min(1),
});

export const DiagChoice = Base.extend({
  type: z.literal("choice"),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  correct: z.number().int().min(0).max(3),
}).refine((i) => new Set(i.options.map((o) => o.toLowerCase())).size === 4, { message: "options must be distinct", path: ["options"] });

export const DiagCloze = Base.extend({
  type: z.literal("cloze"),
  sentence: z.string().refine((s) => s.split("___").length === 2, "cloze needs exactly one ___"),
  accept: z.array(z.string().min(1)).min(1),
});

export const DiagItem = z.union([DiagChoice, DiagCloze]).superRefine((i, ctx) => {
  if (i.skill === "reading" && !i.passage) ctx.addIssue({ code: "custom", message: "reading items need a passage" });
  if (i.skill === "listening" && !i.passage) ctx.addIssue({ code: "custom", message: "listening items need the spoken text in passage" });
});
export type DiagItem = z.infer<typeof DiagItem>;

export const DiagBank = z.object({
  version: z.number().int().positive(),
  items: z.array(DiagItem).min(30),
});
export type DiagBank = z.infer<typeof DiagBank>;

/**
 * Rule-based difficulty prior on a logit scale (Rasch). Band centres are spaced 1.5 logits apart,
 * a common rule of thumb for CEFR bands on calibrated scales; recalibrate when response data exists.
 */
export const BAND_CENTRE: Record<DiagBand, number> = { A1: -3.75, A2: -2.25, B1: -0.75, B2: 0.75, C1: 2.25, C2: 3.75 };
/** Lower edge of each band on the ability scale. Below A1's edge is "Pre-A1". */
export const BAND_FLOOR: Record<DiagBand, number> = { A1: -4.5, A2: -3, B1: -1.5, B2: 0, C1: 1.5, C2: 3 };

export function itemDifficulty(i: Pick<DiagItem, "band" | "shift">): number {
  return BAND_CENTRE[i.band] + (i.shift ?? 0) * 1.2;
}

export function bandForAbility(theta: number): DiagBand | "preA1" {
  let out: DiagBand | "preA1" = "preA1";
  for (const b of DIAG_BANDS) if (theta >= BAND_FLOOR[b]) out = b;
  return out;
}
