import { z } from "zod";
import { SUPPORTED_LANGUAGES, type UiLanguage } from "../i18n/strings";

/** Pre-A1 through C2, plus the Companion Volume's "plus" sub-levels. */
export const BANDS = ["preA1", "A1", "A2", "A2+", "B1", "B1+", "B2", "B2+", "C1", "C2"] as const;
export const Band = z.enum(BANDS);
export type Band = z.infer<typeof Band>;

export const Skill = z.enum(["vocabulary", "grammar", "reading", "listening", "writing", "speaking", "pronunciation"]);
export type Skill = z.infer<typeof Skill>;

/**
 * Text written for the learner in their own language (explanations, hints, glosses).
 * English is required and is the source; other languages are optional per item and
 * fall back to English. Exercise prompts and answers are English and are NOT localized.
 */
export const LocalizedText = z
  .object({ en: z.string().min(1) })
  .catchall(z.string().min(1))
  .refine((v) => Object.keys(v).every((k) => (SUPPORTED_LANGUAGES as readonly string[]).includes(k)), {
    message: `Localized text may only use: ${SUPPORTED_LANGUAGES.join(", ")}`,
  });
export type LocalizedText = z.infer<typeof LocalizedText>;

export function localize(text: LocalizedText, lang: UiLanguage): string {
  return (text as Record<string, string>)[lang] ?? text.en;
}

const Id = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "ids are lowercase, dot/hyphen separated");

/** Graded hint ladder: shown one at a time after a wrong answer, before the answer is revealed. */
const Hints = z.array(LocalizedText).max(3).default([]);

const ItemBase = z.object({
  id: Id,
  band: Band,
  skill: Skill,
  competence: Id,
  objective: LocalizedText,
  /** Rule-based difficulty prior in logits (Rasch scale); recalibrated from responses later. */
  difficulty: z.number().min(-6).max(6),
  explanation: LocalizedText,
  hints: Hints,
  words: z.array(z.string()).default([]),
  structures: z.array(Id).default([]),
  tags: z.array(z.string()).default([]),
  review: z.object({
    author: z.string().min(1),
    status: z.enum(["draft", "reviewed", "approved"]),
    reviewer: z.string().optional(),
  }),
});

/** Gap fill: the sentence contains exactly one "___". */
export const ClozeItem = ItemBase.extend({
  type: z.literal("cloze"),
  sentence: z.string().refine((s) => s.split("___").length === 2, "cloze sentence needs exactly one ___"),
  accept: z.array(z.string().min(1)).min(1),
});

export const ChoiceItem = ItemBase.extend({
  type: z.literal("choice"),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(5),
  correct: z.number().int().min(0),
}).refine((i) => i.correct < i.options.length, { message: "correct index out of range", path: ["correct"] })
  .refine((i) => new Set(i.options.map((o) => o.toLowerCase())).size === i.options.length, {
    message: "options must be distinct",
    path: ["options"],
  });

/** Sentence building: learner orders tiles; any accepted ordering counts. */
export const BuildItem = ItemBase.extend({
  type: z.literal("build"),
  tiles: z.array(z.string().min(1)).min(2),
  accept: z.array(z.string().min(1)).min(1),
}).refine(
  (i) => i.accept.every((a) => normalizeAnswer(a).split(" ").sort().join(" ") === normalizeAnswer(i.tiles.join(" ")).split(" ").sort().join(" ")),
  { message: "every accepted answer must use exactly the given tiles", path: ["accept"] },
);

export const Item = z.union([ClozeItem, ChoiceItem, BuildItem]);
export type Item = z.infer<typeof Item>;

/** A competence = one region on the map. */
export const Competence = z.object({
  id: Id,
  band: Band,
  title: LocalizedText,
  canDo: LocalizedText,
  skills: z.array(Skill).min(1),
  prerequisites: z.array(Id).default([]),
});
export type Competence = z.infer<typeof Competence>;

export const ContentPack = z.object({
  id: Id,
  version: z.number().int().positive(),
  band: Band,
  competences: z.array(Competence).min(1),
  items: z.array(Item).min(1),
});
export type ContentPack = z.infer<typeof ContentPack>;

/** Answer normalisation used for checking typed answers: case, spacing, curly quotes, final punctuation. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "")
    .toLowerCase();
}
