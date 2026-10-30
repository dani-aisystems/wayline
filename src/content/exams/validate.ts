import { ExamPack, type ExamTask } from "./schema";
import { EXAMS, partSpec } from "./spec";
import { isExamTag } from "./tags";
import { normalizeAnswer } from "../schema";

export type ExamIssue = { level: "error" | "warning"; where: string; message: string };

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
/** Words in a key word transformation answer; contractions count as two words (Cambridge practice). */
const kwtWords = (s: string) => words(s.replace(/n't\b/g, " not").replace(/'(re|ve|ll|d|m|s)\b/g, " x"));

/**
 * Checks exam packs against the official task specifications. Errors fail the content test; warnings
 * flag quality risks (e.g. correct answers that stand out by length).
 */
export function validateExamPacks(raw: unknown[]): { tasks: ExamTask[]; issues: ExamIssue[] } {
  const issues: ExamIssue[] = [];
  const tasks: ExamTask[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) => issues.push({ level: "warning", where, message });

  raw.forEach((r, i) => {
    const parsed = ExamPack.safeParse(r);
    if (!parsed.success) {
      for (const e of parsed.error.issues.slice(0, 12)) err(`pack #${i}`, `${e.path.join(".")}: ${e.message}`);
      return;
    }
    tasks.push(...parsed.data.tasks);
  });

  const ids = new Set<string>();
  // Answer-key balance per exam: the right option must not be predictable by length or position.
  const balance = new Map<string, { n: number; longest: number; pos: number[] }>();
  const mc = (exam: string, options: string[], correct: number) => {
    const b = balance.get(exam) ?? { n: 0, longest: 0, pos: [0, 0, 0, 0] };
    const len = options.map((o) => o.length);
    const max = Math.max(...len);
    if (len[correct] === max && len.filter((l) => l === max).length === 1) b.longest++;
    b.n++;
    b.pos[correct]++;
    balance.set(exam, b);
  };

  for (const t of tasks) {
    const w = t.id;
    if (ids.has(t.id)) err(w, "duplicate task id");
    ids.add(t.id);
    const spec = partSpec(t.exam, t.paper, t.part);
    if (!spec) { err(w, `no part ${t.part} in ${t.paper}`); continue; }
    if (spec.kind !== t.kind) err(w, `part ${t.part} must be ${spec.kind}, not ${t.kind}`);
    const examSpec = EXAMS[t.exam];

    const numbers = (qs: { n: number; tag: string }[]) => {
      const expected = spec.to - spec.from + 1;
      if (t.kind !== "writing" && t.kind !== "speaking" && qs.length !== expected) err(w, `expected ${expected} questions, got ${qs.length}`);
      qs.forEach((q, k) => {
        if (q.n !== spec.from + k) err(w, `question ${k + 1} should be numbered ${spec.from + k}, is ${q.n}`);
        if (!isExamTag(q.tag)) err(w, `q${q.n}: unknown tag ${q.tag}`);
      });
    };
    const gaps = (text: string, qs: { n: number }[]) => {
      for (const q of qs) if (!text.includes(`{{${q.n}}}`)) err(w, `gap {{${q.n}}} missing from text`);
      const extra = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])).filter((n) => !qs.some((q) => q.n === n));
      if (extra.length) err(w, `text has gaps with no question: ${extra.join(", ")}`);
    };

    switch (t.kind) {
      case "mc-cloze":
        numbers(t.questions); gaps(t.text, t.questions);
        t.questions.forEach((q) => { mc(t.exam, q.options, q.correct); if (new Set(q.options).size !== 4) err(w, `q${q.n}: duplicate options`); });
        break;
      case "open-cloze":
        numbers(t.questions); gaps(t.text, t.questions);
        t.questions.forEach((q) => q.accept.forEach((a) => { if (words(a) !== 1) err(w, `q${q.n}: open cloze answers are one word ("${a}")`); }));
        break;
      case "word-formation":
        numbers(t.questions); gaps(t.text, t.questions);
        t.questions.forEach((q) => { if (!t.text.includes(q.stem)) warn(w, `q${q.n}: stem ${q.stem} not shown in text`); });
        break;
      case "kwt": {
        numbers(t.questions);
        const [lo, hi] = examSpec.kwtWords;
        for (const q of t.questions) {
          for (const a of q.accept) {
            if (!new RegExp(`\\b${q.keyword}\\b`, "i").test(a)) err(w, `q${q.n}: answer "${a}" must contain ${q.keyword}`);
            const n = kwtWords(a);
            if (n < lo || n > hi) err(w, `q${q.n}: answer "${a}" has ${n} words (allowed ${lo}–${hi})`);
          }
          const full = q.accept.map(normalizeAnswer);
          const chunkOk = q.accept.some((a) => q.chunks.every((c) => c.some((x) => normalizeAnswer(a).includes(normalizeAnswer(x)))));
          if (!chunkOk) err(w, `q${q.n}: the two mark chunks must both appear in at least one full answer`);
          if (full.some((a) => normalizeAnswer(q.first).includes(a))) warn(w, `q${q.n}: answer copies the first sentence`);
        }
        break;
      }
      case "reading-mc":
        numbers(t.questions); t.questions.forEach((q) => mc(t.exam, q.options, q.correct));
        if (words(t.text) < (t.exam === "c1-advanced" ? 550 : 500)) warn(w, `text is short for this part (${words(t.text)} words)`);
        break;
      case "cross-text":
        numbers(t.questions);
        break;
      case "gapped-text": {
        numbers(t.questions); gaps(t.text, t.questions);
        const answers = t.questions.map((q) => q.answer);
        if (new Set(answers).size !== answers.length) err(w, "each option fits only one gap");
        if (answers.some((a) => !t.options.some((o) => o.letter === a))) err(w, "answer letter not among options");
        break;
      }
      case "matching":
        numbers(t.questions);
        if (t.questions.some((q) => !t.sections.some((s) => s.letter === q.answer))) err(w, "answer letter not among sections");
        break;
      case "listen-mc": {
        const qs = t.extracts.flatMap((e) => e.questions);
        numbers(qs);
        const shape: Record<string, [number, number]> = { "b2-first:1": [8, 1], "b2-first:4": [1, 7], "c1-advanced:1": [3, 2], "c1-advanced:3": [1, 6] };
        const [ext, per] = shape[`${t.exam}:${t.part}`] ?? [0, 0];
        if (t.extracts.length !== ext || t.extracts.some((e) => e.questions.length !== per)) err(w, `expected ${ext} extract(s) × ${per} question(s)`);
        for (const q of qs) {
          if (q.options.length !== spec.options) err(w, `q${q.n}: ${spec.options} options expected`);
          if (q.correct >= q.options.length) err(w, `q${q.n}: correct index out of range`);
          mc(t.exam, [...q.options, ...Array(4 - q.options.length).fill("")], q.correct);
        }
        for (const e of t.extracts) {
          const named = [...e.script.matchAll(/^([A-Z][A-Za-z]{0,15}):\s/gm)].map((m) => m[1]);
          for (const n of new Set(named)) if (!e.speakers.some((s) => s.name === n)) err(w, `speaker ${n} has no voice`);
        }
        break;
      }
      case "listen-sentence":
        numbers(t.questions);
        for (const q of t.questions) if (!q.accept.some((a) => normalizeAnswer(t.script).includes(normalizeAnswer(a)))) err(w, `q${q.n}: answer "${q.accept[0]}" is not heard in the script`);
        break;
      case "listen-matching": {
        const want = t.exam === "c1-advanced" ? 2 : 1;
        if (t.tasks.length !== want) err(w, `expected ${want} matching task(s)`);
        numbers(t.tasks.flatMap((x) => x.questions));
        break;
      }
      case "writing": {
        const [lo, hi] = spec.words!;
        const n = words(t.model);
        if (n < lo || n > hi + 10) err(w, `model answer has ${n} words (task asks ${lo}–${hi})`);
        const genres = t.part === 1 ? examSpec.writingGenres.part1 : examSpec.writingGenres.part2;
        if (!genres.includes(t.genre)) err(w, `${t.genre} is not a Part ${t.part} genre for ${examSpec.name}`);
        break;
      }
      case "speaking":
        if (t.part === 2 && (t.pictures?.length ?? 0) !== (t.exam === "c1-advanced" ? 3 : 2)) err(w, "long turn needs 2 pictures (B2) or 3 (C1)");
        if (t.part === 3 && (t.prompts?.length ?? 0) !== 5) err(w, "collaborative task needs five prompts");
        break;
    }
  }

  for (const [exam, b] of balance) {
    if (b.n >= 20 && b.longest / b.n > 0.35) warn(exam, `correct option is the longest in ${Math.round((100 * b.longest) / b.n)}% of multiple-choice questions (keep ≤ 35%)`);
    for (const [k, c] of b.pos.entries()) if (b.n >= 20 && c / b.n > 0.4) warn(exam, `option ${"ABCD"[k]} is correct in ${Math.round((100 * c) / b.n)}% of questions`);
  }

  // Each mock set must contain every part of every paper (Writing Part 2 has three tasks to choose from).
  for (const exam of Object.values(EXAMS)) {
    const sets = new Set(tasks.filter((t) => t.exam === exam.id && t.set.startsWith("mock")).map((t) => t.set));
    for (const set of sets) {
      for (const p of exam.papers) for (const part of p.parts) {
        const n = tasks.filter((t) => t.exam === exam.id && t.set === set && t.paper === p.paper && t.part === part.part).length;
        const want = p.paper === "writing" && part.part === 2 ? 3 : 1;
        if (n !== want) err(`${exam.id} ${set}`, `${p.name} Part ${part.part}: ${n} task(s), expected ${want}`);
      }
    }
  }
  return { tasks, issues };
}
