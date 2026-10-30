import { normalizeAnswer } from "../../content/schema";
import type { ExamTask } from "../../content/exams/schema";
import { EXAMS, partSpec, type Skill } from "../../content/exams/spec";

export type QuestionResult = { n: number; tag: string; marks: number; max: number; given: string; key: string; correct: boolean };
export type Responses = Record<string, string>; // question number → answer text (or option index / letter)

const same = (a: string, b: string) => normalizeAnswer(a) === normalizeAnswer(b);
const wordCount = (s: string) => s.trim().replace(/n't\b/g, " not").replace(/'(re|ve|ll|d|m|s)\b/g, " x").split(/\s+/).filter(Boolean).length;

/**
 * Key word transformation, marked as Cambridge describes: up to 2 marks, one for each half of the answer.
 * Zero if the key word is missing or changed, or the answer is outside the allowed word count.
 */
export function markKwt(answer: string, q: { keyword: string; accept: string[]; chunks: [string[], string[]] }, words: [number, number]): number {
  const a = normalizeAnswer(answer);
  if (!a) return 0;
  if (!new RegExp(`\\b${q.keyword.toLowerCase()}\\b`).test(a)) return 0;
  const n = wordCount(a);
  if (n < words[0] || n > words[1]) return 0;
  if (q.accept.some((x) => same(x, a))) return 2;
  return q.chunks.filter((c) => c.some((x) => a.includes(normalizeAnswer(x)))).length;
}

/** Mark one task's objective questions. Writing and speaking are assessed separately (see writing.ts). */
export function scoreTask(t: ExamTask, r: Responses): QuestionResult[] {
  const spec = partSpec(t.exam, t.paper, t.part)!;
  const per = spec.marksPerQuestion;
  const mcq = (q: { n: number; tag: string; options: string[]; correct: number }) => {
    const given = r[q.n] ?? "";
    const ok = given !== "" && Number(given) === q.correct;
    return { n: q.n, tag: q.tag, marks: ok ? per : 0, max: per, given: given === "" ? "" : q.options[Number(given)] ?? "", key: q.options[q.correct], correct: ok };
  };
  const open = (q: { n: number; tag: string; accept: string[] }) => {
    const given = r[q.n] ?? "";
    const ok = q.accept.some((a) => same(a, given));
    return { n: q.n, tag: q.tag, marks: ok ? per : 0, max: per, given, key: q.accept[0], correct: ok };
  };
  const letter = (q: { n: number; tag: string; answer: string }) => {
    const given = r[q.n] ?? "";
    const ok = given === q.answer;
    return { n: q.n, tag: q.tag, marks: ok ? per : 0, max: per, given, key: q.answer, correct: ok };
  };
  switch (t.kind) {
    case "mc-cloze":
    case "reading-mc":
      return t.questions.map(mcq);
    case "open-cloze":
    case "word-formation":
    case "listen-sentence":
      return t.questions.map(open);
    case "kwt":
      return t.questions.map((q) => {
        const given = r[q.n] ?? "";
        const marks = markKwt(given, q, EXAMS[t.exam].kwtWords);
        return { n: q.n, tag: q.tag, marks, max: 2, given, key: q.accept[0], correct: marks === 2 };
      });
    case "cross-text":
    case "gapped-text":
    case "matching":
      return t.questions.map(letter);
    case "listen-mc":
      return t.extracts.flatMap((e) => e.questions).map(mcq);
    case "listen-matching":
      return t.tasks.flatMap((x) => x.questions).map(letter);
    case "writing":
    case "speaking":
      return [];
  }
}

/** Which reported skill a task's marks count toward (Reading & Use of English Part 1 counts as Reading). */
export function skillOf(t: ExamTask): Skill {
  return partSpec(t.exam, t.paper, t.part)!.skill;
}
