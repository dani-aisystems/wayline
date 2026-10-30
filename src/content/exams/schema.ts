import { z } from "zod";
import { LocalizedText } from "../schema";

/**
 * Exam-preparation content (Cambridge B2 First, C1 Advanced). Every task is ORIGINAL practice material
 * written to the official task specifications (see spec.ts). Nothing is copied from Cambridge papers.
 *
 * A task is one part of one paper (e.g. C1 Reading and Use of English Part 4) with all its questions.
 * Gaps in texts are written as {{n}} where n is the question number. Question numbers follow the
 * real paper's numbering for that part (e.g. C1 Part 2 uses 9–16).
 */
export const ExamId = z.enum(["b2-first", "c1-advanced"]);
export type ExamId = z.infer<typeof ExamId>;
export const Paper = z.enum(["reading", "writing", "listening", "speaking"]);
export type Paper = z.infer<typeof Paper>;

const Id = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
/** Weakness tags, e.g. "uoe.passive", "wf.negative-prefix", "read.inference". See tags.ts. */
const Tag = z.string().regex(/^[a-z]+\.[a-z0-9-]+$/);
const Letter = z.enum(["A", "B", "C", "D", "E", "F", "G", "H"]);

const Base = z.object({
  id: Id,
  exam: ExamId,
  paper: Paper,
  part: z.number().int().min(1).max(8),
  /** "mock-1", "mock-2" = belongs to a full mock test; "drill" = extra practice only. */
  set: z.string().regex(/^(mock-\d+|drill)$/),
  title: z.string().min(1),
  topic: z.string().min(1),
  /** Exam-style rubric shown to the candidate, in English, as in the real paper. */
  instructions: z.string().min(1),
  status: z.enum(["draft", "reviewed"]).default("draft"),
});

const Why = LocalizedText; // explanation of the right answer (and why tempting wrong ones are wrong)

const McQ = z.object({ n: z.number().int(), options: z.array(z.string().min(1)).length(4), correct: z.number().int().min(0).max(3), tag: Tag, why: Why });
const OpenQ = z.object({ n: z.number().int(), accept: z.array(z.string().min(1)).min(1), tag: Tag, why: Why });

/** Reading & Use of English Part 1 (both exams): 4-option multiple-choice cloze. */
export const McCloze = Base.extend({ kind: z.literal("mc-cloze"), text: z.string(), questions: z.array(McQ).length(8) });
/** Part 2: open cloze — one word per gap. */
export const OpenCloze = Base.extend({ kind: z.literal("open-cloze"), text: z.string(), questions: z.array(OpenQ).length(8) });
/** Part 3: word formation — change the stem in capitals. */
export const WordFormation = Base.extend({
  kind: z.literal("word-formation"),
  text: z.string(),
  questions: z.array(OpenQ.extend({ stem: z.string().regex(/^[A-Z]+$/) })).length(8),
});
/**
 * Part 4: key word transformation. The answer goes between `before` and `after`. Two marks: one per
 * `chunks` element (each a list of acceptable spellings of that half). B2: 2–5 words, C1: 3–6 words,
 * including the key word, which must not be changed.
 */
export const Kwt = Base.extend({
  kind: z.literal("kwt"),
  questions: z
    .array(
      z.object({
        n: z.number().int(),
        first: z.string(),
        keyword: z.string().regex(/^[A-Z]+$/),
        before: z.string(),
        after: z.string(),
        accept: z.array(z.string()).min(1), // complete answers (2 marks)
        chunks: z.tuple([z.array(z.string()).min(1), z.array(z.string()).min(1)]), // 1 mark each
        tag: Tag,
        why: Why,
      }),
    )
    .length(6),
});
/** Long text + 4-option multiple choice (B2 Part 5, C1 Part 5). */
export const ReadingMc = Base.extend({
  kind: z.literal("reading-mc"),
  text: z.string(),
  questions: z.array(McQ.extend({ question: z.string() })).length(6),
});
/** C1 Part 6: four short texts by different writers; which writer…? */
export const CrossText = Base.extend({
  kind: z.literal("cross-text"),
  texts: z.array(z.object({ letter: Letter, author: z.string(), text: z.string() })).length(4),
  questions: z.array(z.object({ n: z.number().int(), question: z.string(), answer: Letter, tag: Tag, why: Why })).length(4),
});
/** Gapped text (B2 Part 6: sentences, 6 gaps + 1 extra; C1 Part 7: paragraphs, 6 gaps + 1 extra). */
export const GappedText = Base.extend({
  kind: z.literal("gapped-text"),
  text: z.string(),
  options: z.array(z.object({ letter: Letter, text: z.string() })).length(7),
  questions: z.array(z.object({ n: z.number().int(), answer: Letter, tag: Tag, why: Why })).length(6),
});
/** Multiple matching (B2 Part 7, C1 Part 8): sections A–D/E/F and 10 statements. */
export const Matching = Base.extend({
  kind: z.literal("matching"),
  sections: z.array(z.object({ letter: Letter, heading: z.string(), text: z.string() })).min(4).max(6),
  questions: z.array(z.object({ n: z.number().int(), statement: z.string(), answer: Letter, tag: Tag, why: Why })).length(10),
});

/**
 * Listening. Scripts: one line per turn as "Name: text"; a monologue is plain text.
 * `speakers` gives each named speaker's voice (presentation + accent) for the recorded audio.
 */
const Speaker = z.object({ name: z.string(), presents: z.enum(["female", "male"]), accent: z.enum(["US", "GB"]) });
export const ListenMc = Base.extend({
  kind: z.literal("listen-mc"),
  /** B2 Part 1: 8 extracts × 1 question (3 options). C1 Part 1: 3 extracts × 2 questions. B2 Part 4 / C1 Part 3: 1 extract × 7/6. */
  extracts: z.array(
    z.object({
      context: z.string(), // "You hear a woman talking about…"
      speakers: z.array(Speaker).min(1),
      script: z.string(),
      questions: z.array(z.object({ n: z.number().int(), question: z.string(), options: z.array(z.string()).min(3).max(4), correct: z.number().int(), tag: Tag, why: Why })).min(1),
    }),
  ),
});
export const ListenSentence = Base.extend({
  kind: z.literal("listen-sentence"),
  context: z.string(),
  speakers: z.array(Speaker).min(1),
  script: z.string(),
  /** Sentences shown to the candidate with ___ for the gap; answers are words heard in the recording. */
  questions: z.array(z.object({ n: z.number().int(), sentence: z.string().regex(/___/), accept: z.array(z.string()).min(1), tag: Tag, why: Why })),
});
export const ListenMatching = Base.extend({
  kind: z.literal("listen-matching"),
  context: z.string(),
  /** Five speakers, each a short monologue. */
  monologues: z.array(z.object({ speaker: Speaker, script: z.string() })).length(5),
  /** B2: one task of 8 options. C1: two tasks of 8 options each. */
  tasks: z
    .array(
      z.object({
        prompt: z.string(),
        options: z.array(z.object({ letter: Letter, text: z.string() })).length(8),
        questions: z.array(z.object({ n: z.number().int(), answer: Letter, tag: Tag, why: Why })).length(5),
      }),
    )
    .min(1)
    .max(2),
});

/** Writing: assessed on the four official subscales. `points` are what a full answer must cover. */
export const WritingTask = Base.extend({
  kind: z.literal("writing"),
  genre: z.enum(["essay", "article", "email", "letter", "report", "review", "proposal", "story"]),
  /** The candidate-facing task, including any input text or notes. */
  prompt: z.string(),
  points: z.array(z.object({ label: z.string(), keywords: z.array(z.string()).min(1) })).min(2),
  register: z.enum(["formal", "neutral", "informal"]),
  model: z.string(), // an original model answer within the word range
  modelNotes: LocalizedText, // why the model would score well, subscale by subscale
});

/** Speaking: the examiner script for one part; the candidate records spoken answers. */
export const SpeakingTask = Base.extend({
  kind: z.literal("speaking"),
  /** Examiner turns, read aloud by the examiner voice. */
  examiner: z.array(z.string()).min(1),
  /** Part 2 long turn: picture descriptions (shown as cards, since there are no exam photos). */
  pictures: z.array(z.object({ letter: Letter, description: z.string() })).optional(),
  /** Part 3: central question and five written prompts. */
  prompts: z.array(z.string()).optional(),
  /** Seconds the candidate speaks per turn (e.g. 60 for a long turn). */
  turnSeconds: z.number().int().positive(),
  usefulLanguage: z.array(z.string()).min(3),
  sample: z.string(), // an original strong sample answer for one turn
});

export const ExamTask = z.discriminatedUnion("kind", [
  McCloze, OpenCloze, WordFormation, Kwt, ReadingMc, CrossText, GappedText, Matching, ListenMc, ListenSentence, ListenMatching, WritingTask, SpeakingTask,
]);
export type ExamTask = z.infer<typeof ExamTask>;
export type TaskKind = ExamTask["kind"];

/** Theory for one part: what it tests, strategy, a worked example. Shown before practice. */
export const PartGuide = z.object({
  exam: ExamId,
  paper: Paper,
  part: z.number().int().min(1).max(8),
  tests: LocalizedText,
  strategy: z.array(LocalizedText).min(3),
  /** A short worked example: the question, then step-by-step reasoning. */
  example: z.object({ question: z.string(), steps: z.array(LocalizedText).min(2), answer: z.string() }),
  pitfalls: z.array(LocalizedText).min(2),
});
export type PartGuide = z.infer<typeof PartGuide>;

/** Theory for a weakness tag: the underlying grammar/vocabulary point, with examples. */
export const TagLesson = z.object({
  tag: Tag,
  title: LocalizedText,
  explanation: LocalizedText,
  examples: z.array(z.string()).min(2),
});
export type TagLesson = z.infer<typeof TagLesson>;

export const ExamPack = z.object({
  id: Id,
  tasks: z.array(ExamTask).default([]),
  guides: z.array(PartGuide).default([]),
  lessons: z.array(TagLesson).default([]),
});
export type ExamPack = z.infer<typeof ExamPack>;
