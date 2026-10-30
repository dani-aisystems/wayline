import { db, type ExamAnswerRow, type ExamAttemptRow, type WaylineDB } from "../../db/db";
import type { ExamTask } from "../../content/exams/schema";
import type { Skill } from "../../content/exams/spec";
import { award } from "../xp";
import { scoreTask, skillOf, type QuestionResult, type Responses } from "./scoring";
import type { Subscale } from "./writing";

export const EXAM_XP = { section: 20, paper: 40, mock: 100, diagnostic: 30 } as const;

export type WritingMark = { taskId: string; marks: Record<Subscale, number>; source: "auto" | "self"; text: string };
export type SpeakingMark = { taskId: string; criteria: Record<string, number> };

export type AttemptResult = {
  attemptId: number;
  results: Map<string, QuestionResult[]>;
  skills: Partial<Record<Skill, { raw: number; max: number }>>;
  xp: number;
};

/** Start (or resume) an attempt; the draft is saved as the learner answers. */
export async function startAttempt(a: Omit<ExamAttemptRow, "id" | "seconds" | "startedAt">, database: WaylineDB = db, now = new Date()): Promise<number> {
  return (await database.examAttempts.add({ ...a, seconds: 0, startedAt: now.toISOString() })) as number;
}

export async function saveDraft(id: number, draft: ExamAttemptRow["draft"], seconds: number, database: WaylineDB = db) {
  await database.examAttempts.update(id, { draft, seconds });
}

/**
 * Finish an attempt: mark every question, store one evidence row per question (writing: per subscale,
 * speaking: per part), total the raw marks by reported skill, and award XP once (idempotent by attempt id).
 */
export async function finishAttempt(
  id: number,
  tasks: ExamTask[],
  responses: Record<string, Responses>,
  extra: { writing?: WritingMark[]; speaking?: SpeakingMark[]; seconds: number },
  database: WaylineDB = db,
  now = new Date(),
): Promise<AttemptResult> {
  const attempt = await database.examAttempts.get(id);
  if (!attempt) throw new Error("attempt not found");
  if (attempt.finishedAt) {
    // Already finished (double submit or reload): return the stored outcome, no new rows or XP.
    const results = new Map(tasks.map((t) => [t.id, scoreTask(t, responses[t.id] ?? {})]));
    return { attemptId: id, results, skills: attempt.skills ?? {}, xp: 0 };
  }
  const at = now.toISOString();
  const rows: ExamAnswerRow[] = [];
  const results = new Map<string, QuestionResult[]>();
  const skills: Partial<Record<Skill, { raw: number; max: number }>> = {};
  const add = (skill: Skill, raw: number, max: number) => {
    const s = (skills[skill] ??= { raw: 0, max: 0 });
    s.raw += raw;
    s.max += max;
  };
  const totalQuestions = tasks.reduce((n, t) => n + scoreTask(t, {}).length, 0);
  const perQuestion = totalQuestions ? Math.round(extra.seconds / totalQuestions) : undefined;

  for (const t of tasks) {
    const qr = scoreTask(t, responses[t.id] ?? {});
    results.set(t.id, qr);
    const skill = skillOf(t);
    for (const q of qr) {
      rows.push({ attemptId: id, exam: t.exam, taskId: t.id, paper: t.paper, part: t.part, skill, n: q.n, tag: q.tag, marks: q.marks, max: q.max, given: q.given.slice(0, 500), at, timed: attempt.timed, seconds: perQuestion });
      add(skill, q.marks, q.max);
    }
  }
  for (const w of extra.writing ?? []) {
    const t = tasks.find((x) => x.id === w.taskId);
    if (!t) continue;
    for (const [sub, marks] of Object.entries(w.marks)) {
      rows.push({ attemptId: id, exam: t.exam, taskId: t.id, paper: "writing", part: t.part, skill: "writing", n: 1, tag: `write.${sub}`, marks, max: 5, given: sub === "content" ? w.text.slice(0, 4000) : "", at, timed: attempt.timed, source: w.source });
      add("writing", marks, 5);
    }
  }
  for (const s of extra.speaking ?? []) {
    const t = tasks.find((x) => x.id === s.taskId);
    if (!t) continue;
    const vals = Object.values(s.criteria);
    const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    const tag = `speak.${["interview", "long-turn", "collaboration", "discussion"][t.part - 1]}`;
    rows.push({ attemptId: id, exam: t.exam, taskId: t.id, paper: "speaking", part: t.part, skill: "speaking", n: 1, tag, marks: Math.round(avg * 10) / 10, max: 5, given: JSON.stringify(s.criteria), at, timed: attempt.timed, source: "self" });
    add("speaking", avg, 5);
  }

  await database.transaction("rw", database.examAttempts, database.examAnswers, async () => {
    const fresh = await database.examAttempts.get(id);
    if (fresh?.finishedAt) return;
    await database.examAnswers.bulkAdd(rows);
    // The final responses stay in `draft` so the result page can show them for review.
    await database.examAttempts.update(id, { finishedAt: at, seconds: extra.seconds, skills, draft: responses });
  });
  const amount = EXAM_XP[attempt.mode === "topic" ? "section" : attempt.mode];
  const paid = await award(`exam:${id}`, amount, "lesson", database, now);
  return { attemptId: id, results, skills, xp: paid ? amount : 0 };
}
