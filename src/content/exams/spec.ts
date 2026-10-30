import type { ExamId, Paper, TaskKind } from "./schema";

/**
 * Official structure of the Cambridge English exams Wayline prepares for. Every number here comes from
 * Cambridge English's public documentation (sources below, checked 30 Oct 2026). Practice scores built
 * on these tables are estimates: Cambridge states the conversion tables are for official practice tests
 * and do not predict live-exam scores precisely.
 */
export type PartSpec = {
  part: number;
  kind: TaskKind;
  /** First and last question numbers on the real paper. */
  from: number;
  to: number;
  marksPerQuestion: number;
  /** Which reported skill the marks count toward. Reading & Use of English Part 1 counts toward Reading. */
  skill: "reading" | "useOfEnglish" | "writing" | "listening" | "speaking";
  name: string;
  focus: string;
  options?: number;
  words?: [number, number];
  seconds?: number;
};

export type PaperSpec = { paper: Paper; name: string; minutes: number; parts: PartSpec[] };

export type ScaleRow = { scale: number; raw: Record<Skill, number> };
export type Skill = "reading" | "useOfEnglish" | "writing" | "listening" | "speaking";

export type ExamSpec = {
  id: ExamId;
  name: string;
  short: string;
  level: "B2" | "C1";
  /** Cambridge English Scale: grades on the overall score (average of the five skill scores). */
  grades: { label: string; min: number; max: number; cefr: string }[];
  reportedFrom: number;
  maxRaw: Record<Skill, number>;
  /** Official practice-test conversion: raw mark needed for each scale boundary. */
  conversion: ScaleRow[];
  papers: PaperSpec[];
  kwtWords: [number, number];
  writingGenres: { part1: string[]; part2: string[] };
  sources: { label: string; url: string }[];
};

export const SKILLS: Skill[] = ["reading", "useOfEnglish", "writing", "listening", "speaking"];

export const B2_FIRST: ExamSpec = {
  id: "b2-first",
  name: "B2 First",
  short: "FCE",
  level: "B2",
  grades: [
    { label: "Grade A", min: 180, max: 190, cefr: "C1" },
    { label: "Grade B", min: 173, max: 179, cefr: "B2" },
    { label: "Grade C", min: 160, max: 172, cefr: "B2" },
    { label: "Level B1", min: 140, max: 159, cefr: "B1" },
  ],
  reportedFrom: 122,
  maxRaw: { reading: 42, useOfEnglish: 28, writing: 40, listening: 30, speaking: 60 },
  conversion: [
    { scale: 180, raw: { reading: 37, useOfEnglish: 24, writing: 34, listening: 27, speaking: 54 } },
    { scale: 160, raw: { reading: 24, useOfEnglish: 18, writing: 24, listening: 18, speaking: 36 } },
    { scale: 140, raw: { reading: 16, useOfEnglish: 11, writing: 16, listening: 12, speaking: 24 } },
    { scale: 122, raw: { reading: 10, useOfEnglish: 7, writing: 10, listening: 8, speaking: 14 } },
  ],
  kwtWords: [2, 5],
  writingGenres: { part1: ["essay"], part2: ["article", "email", "letter", "report", "review"] },
  papers: [
    {
      paper: "reading",
      name: "Reading and Use of English",
      minutes: 75,
      parts: [
        { part: 1, kind: "mc-cloze", from: 1, to: 8, marksPerQuestion: 1, skill: "reading", name: "Multiple-choice cloze", focus: "Vocabulary: meaning, collocation, fixed phrases, phrasal verbs", options: 4 },
        { part: 2, kind: "open-cloze", from: 9, to: 16, marksPerQuestion: 1, skill: "useOfEnglish", name: "Open cloze", focus: "Grammar and some vocabulary: one word per gap" },
        { part: 3, kind: "word-formation", from: 17, to: 24, marksPerQuestion: 1, skill: "useOfEnglish", name: "Word formation", focus: "Word building: prefixes, suffixes, internal changes" },
        { part: 4, kind: "kwt", from: 25, to: 30, marksPerQuestion: 2, skill: "useOfEnglish", name: "Key word transformation", focus: "Grammar and vocabulary: same meaning, 2–5 words including the key word" },
        { part: 5, kind: "reading-mc", from: 31, to: 36, marksPerQuestion: 2, skill: "reading", name: "Multiple choice", focus: "Detail, opinion, attitude, tone, purpose, main idea, implication", options: 4 },
        { part: 6, kind: "gapped-text", from: 37, to: 42, marksPerQuestion: 2, skill: "reading", name: "Gapped text", focus: "Cohesion, coherence, text structure (sentences removed)" },
        { part: 7, kind: "matching", from: 43, to: 52, marksPerQuestion: 1, skill: "reading", name: "Multiple matching", focus: "Specific information, detail, opinion, attitude" },
      ],
    },
    {
      paper: "writing",
      name: "Writing",
      minutes: 80,
      parts: [
        { part: 1, kind: "writing", from: 1, to: 1, marksPerQuestion: 20, skill: "writing", name: "Essay (compulsory)", focus: "Giving and supporting an opinion using two given notes and one idea of your own", words: [140, 190] },
        { part: 2, kind: "writing", from: 2, to: 4, marksPerQuestion: 20, skill: "writing", name: "One task from a choice", focus: "Article, email/letter, report or review for a given reader and purpose", words: [140, 190] },
      ],
    },
    {
      paper: "listening",
      name: "Listening",
      minutes: 40,
      parts: [
        { part: 1, kind: "listen-mc", from: 1, to: 8, marksPerQuestion: 1, skill: "listening", name: "Multiple choice (short extracts)", focus: "Gist, detail, function, attitude, opinion, purpose, feeling, situation, topic", options: 3 },
        { part: 2, kind: "listen-sentence", from: 9, to: 18, marksPerQuestion: 1, skill: "listening", name: "Sentence completion", focus: "Detail, specific information, stated opinion" },
        { part: 3, kind: "listen-matching", from: 19, to: 23, marksPerQuestion: 1, skill: "listening", name: "Multiple matching", focus: "General gist, detail, function, attitude, opinion, purpose, feeling" },
        { part: 4, kind: "listen-mc", from: 24, to: 30, marksPerQuestion: 1, skill: "listening", name: "Multiple choice (interview)", focus: "Opinion, attitude, gist, main idea, specific information", options: 3 },
      ],
    },
    {
      paper: "speaking",
      name: "Speaking",
      minutes: 14,
      parts: [
        { part: 1, kind: "speaking", from: 1, to: 1, marksPerQuestion: 0, skill: "speaking", name: "Interview", focus: "General interactional and social language", seconds: 120 },
        { part: 2, kind: "speaking", from: 2, to: 2, marksPerQuestion: 0, skill: "speaking", name: "Long turn", focus: "Organising a larger unit of discourse; comparing, describing, expressing opinions", seconds: 60 },
        { part: 3, kind: "speaking", from: 3, to: 3, marksPerQuestion: 0, skill: "speaking", name: "Collaborative task", focus: "Exchanging ideas, justifying, agreeing/disagreeing, suggesting, speculating, evaluating, reaching a decision", seconds: 180 },
        { part: 4, kind: "speaking", from: 4, to: 4, marksPerQuestion: 0, skill: "speaking", name: "Discussion", focus: "Expressing and justifying opinions, agreeing and disagreeing", seconds: 240 },
      ],
    },
  ],
  sources: [
    { label: "B2 First exam format (Cambridge English)", url: "https://www.cambridgeenglish.org/exams-and-tests/qualifications/first/format/" },
    { label: "B2 First statement of results factsheet (grade boundaries)", url: "https://www.cambridgeenglish.org/it/Images/664445-b2-statement-of-results-factsheet.pdf" },
    { label: "Converting practice test scores to Cambridge English Scale scores", url: "https://www.cambridgeenglish.org/images/210434-converting-practice-test-scores-to-cambridge-english-scale-scores.pdf" },
  ],
};

export const C1_ADVANCED: ExamSpec = {
  id: "c1-advanced",
  name: "C1 Advanced",
  short: "CAE",
  level: "C1",
  grades: [
    { label: "Grade A", min: 200, max: 210, cefr: "C2" },
    { label: "Grade B", min: 193, max: 199, cefr: "C1" },
    { label: "Grade C", min: 180, max: 192, cefr: "C1" },
    { label: "Level B2", min: 160, max: 179, cefr: "B2" },
  ],
  reportedFrom: 142,
  maxRaw: { reading: 50, useOfEnglish: 28, writing: 40, listening: 30, speaking: 75 },
  conversion: [
    { scale: 200, raw: { reading: 43, useOfEnglish: 23, writing: 34, listening: 26, speaking: 66 } },
    { scale: 180, raw: { reading: 32, useOfEnglish: 16, writing: 24, listening: 18, speaking: 45 } },
    { scale: 160, raw: { reading: 23, useOfEnglish: 11, writing: 16, listening: 13, speaking: 30 } },
    { scale: 142, raw: { reading: 17, useOfEnglish: 8, writing: 10, listening: 11, speaking: 17 } },
  ],
  kwtWords: [3, 6],
  writingGenres: { part1: ["essay"], part2: ["email", "letter", "proposal", "report", "review"] },
  papers: [
    {
      paper: "reading",
      name: "Reading and Use of English",
      minutes: 90,
      parts: [
        { part: 1, kind: "mc-cloze", from: 1, to: 8, marksPerQuestion: 1, skill: "reading", name: "Multiple-choice cloze", focus: "Vocabulary: idioms, collocations, fixed phrases, complementation, phrasal verbs, semantic precision", options: 4 },
        { part: 2, kind: "open-cloze", from: 9, to: 16, marksPerQuestion: 1, skill: "useOfEnglish", name: "Open cloze", focus: "Grammar and some vocabulary: one word per gap" },
        { part: 3, kind: "word-formation", from: 17, to: 24, marksPerQuestion: 1, skill: "useOfEnglish", name: "Word formation", focus: "Affixation, internal changes, compounding" },
        { part: 4, kind: "kwt", from: 25, to: 30, marksPerQuestion: 2, skill: "useOfEnglish", name: "Key word transformation", focus: "Grammar, vocabulary, collocation: 3–6 words including the key word" },
        { part: 5, kind: "reading-mc", from: 31, to: 36, marksPerQuestion: 2, skill: "reading", name: "Multiple choice", focus: "Detail, opinion, tone, purpose, main idea, implication, attitude, text organisation", options: 4 },
        { part: 6, kind: "cross-text", from: 37, to: 40, marksPerQuestion: 2, skill: "reading", name: "Cross-text multiple matching", focus: "Understanding and comparing opinions and attitudes across texts" },
        { part: 7, kind: "gapped-text", from: 41, to: 46, marksPerQuestion: 2, skill: "reading", name: "Gapped text", focus: "Cohesion, coherence, text structure, global meaning (paragraphs removed)" },
        { part: 8, kind: "matching", from: 47, to: 56, marksPerQuestion: 1, skill: "reading", name: "Multiple matching", focus: "Detail, opinion, specific information, implication" },
      ],
    },
    {
      paper: "writing",
      name: "Writing",
      minutes: 90,
      parts: [
        { part: 1, kind: "writing", from: 1, to: 1, marksPerQuestion: 20, skill: "writing", name: "Essay (compulsory)", focus: "Evaluating two of three given points: which is more important, with reasons", words: [220, 260] },
        { part: 2, kind: "writing", from: 2, to: 4, marksPerQuestion: 20, skill: "writing", name: "One task from a choice of three", focus: "Letter/email, proposal, report or review for a given reader and purpose", words: [220, 260] },
      ],
    },
    {
      paper: "listening",
      name: "Listening",
      minutes: 40,
      parts: [
        { part: 1, kind: "listen-mc", from: 1, to: 6, marksPerQuestion: 1, skill: "listening", name: "Multiple choice (three extracts)", focus: "Feeling, attitude, opinion, purpose, function, agreement, course of action, gist, detail", options: 3 },
        { part: 2, kind: "listen-sentence", from: 7, to: 14, marksPerQuestion: 1, skill: "listening", name: "Sentence completion", focus: "Specific information, stated opinion" },
        { part: 3, kind: "listen-mc", from: 15, to: 20, marksPerQuestion: 1, skill: "listening", name: "Multiple choice (conversation)", focus: "Attitude, opinion, agreement, gist, detail, inference", options: 4 },
        { part: 4, kind: "listen-matching", from: 21, to: 30, marksPerQuestion: 1, skill: "listening", name: "Multiple matching (two tasks)", focus: "Gist, attitude, main points, interpreting context" },
      ],
    },
    {
      paper: "speaking",
      name: "Speaking",
      minutes: 15,
      parts: [
        { part: 1, kind: "speaking", from: 1, to: 1, marksPerQuestion: 0, skill: "speaking", name: "Interview", focus: "General interactional and social language", seconds: 120 },
        { part: 2, kind: "speaking", from: 2, to: 2, marksPerQuestion: 0, skill: "speaking", name: "Long turn", focus: "Comparing, describing, expressing opinions, speculating (two of three pictures)", seconds: 60 },
        { part: 3, kind: "speaking", from: 3, to: 3, marksPerQuestion: 0, skill: "speaking", name: "Collaborative task", focus: "Sustaining an interaction, exchanging ideas, negotiating a decision", seconds: 180 },
        { part: 4, kind: "speaking", from: 4, to: 4, marksPerQuestion: 0, skill: "speaking", name: "Discussion", focus: "Expressing and justifying opinions, agreeing and/or disagreeing, speculating", seconds: 300 },
      ],
    },
  ],
  sources: [
    { label: "C1 Advanced exam format (Cambridge English)", url: "https://www.cambridgeenglish.org/exams-and-tests/qualifications/advanced/format/" },
    { label: "C1 Advanced handbook for teachers", url: "https://www.cambridgeenglish.org/latinamerica/Images/167804-cambridge-english-advanced-handbook.pdf" },
    { label: "C1 Advanced statement of results factsheet (grade boundaries)", url: "https://www.cambridgeenglish.org/Images/664448-c1-statement-of-results-factsheet.pdf" },
    { label: "Converting practice test scores to Cambridge English Scale scores", url: "https://www.cambridgeenglish.org/images/210434-converting-practice-test-scores-to-cambridge-english-scale-scores.pdf" },
  ],
};

export const EXAMS: Record<ExamId, ExamSpec> = { "b2-first": B2_FIRST, "c1-advanced": C1_ADVANCED };

export function partSpec(exam: ExamId, paper: Paper, part: number): PartSpec | undefined {
  return EXAMS[exam].papers.find((p) => p.paper === paper)?.parts.find((p) => p.part === part);
}

/**
 * Raw mark → Cambridge English Scale, by straight-line interpolation between the official boundary points
 * (and from the lowest point down to 0 marks). Capped at the exam's top reported score. An estimate.
 */
export function toScale(exam: ExamId, skill: Skill, raw: number): number {
  const spec = EXAMS[exam];
  const top = spec.grades[0].max;
  const pts = [
    { raw: spec.maxRaw[skill], scale: top },
    ...spec.conversion.map((r) => ({ raw: r.raw[skill], scale: r.scale })),
    { raw: 0, scale: spec.conversion.at(-1)!.scale - 20 },
  ].sort((a, b) => b.raw - a.raw);
  const r = Math.max(0, Math.min(raw, spec.maxRaw[skill]));
  for (let i = 0; i < pts.length - 1; i++) {
    const hi = pts[i], lo = pts[i + 1];
    if (r <= hi.raw && r >= lo.raw) {
      if (hi.raw === lo.raw) return hi.scale;
      return Math.round(lo.scale + ((r - lo.raw) * (hi.scale - lo.scale)) / (hi.raw - lo.raw));
    }
  }
  return pts.at(-1)!.scale;
}

/** Overall score = average of the five skill scores (Cambridge statement of results). */
export function overallScale(scores: Partial<Record<Skill, number>>): number | null {
  const vals = SKILLS.map((s) => scores[s]).filter((v): v is number => typeof v === "number");
  return vals.length === SKILLS.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

export function gradeFor(exam: ExamId, scale: number): { label: string; cefr: string } | null {
  const g = EXAMS[exam].grades.find((x) => scale >= x.min && scale <= x.max);
  return g ? { label: g.label, cefr: g.cefr } : scale > EXAMS[exam].grades[0].max ? { label: EXAMS[exam].grades[0].label, cefr: EXAMS[exam].grades[0].cefr } : null;
}
