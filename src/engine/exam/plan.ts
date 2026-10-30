import type { CertGoal, ExamAttemptRow } from "../../db/db";
import type { ExamTask, Paper } from "../../content/exams/schema";
import { EXAMS } from "../../content/exams/spec";
import { examLibrary, mockSets, questionsOf, tasksFor, type ExamLibrary } from "../../content/exams";
import type { Readiness } from "./readiness";

/* ───────────────────────── Weakness → theory → fresh practice ───────────────────────── */

export type Recommendation = {
  tag: string;
  share: number;
  n: number;
  lesson: boolean;
  /** An unseen (or longest-unseen) task that tests this point, for the retest. */
  taskId: string | null;
};

const REPEAT_AFTER_DAYS = 14;

/** Tasks the learner hasn't met, or last met long enough ago to be useful again. */
export function freshTasks(tasks: ExamTask[], attempts: ExamAttemptRow[], now = new Date()): ExamTask[] {
  const last = new Map<string, number>();
  for (const a of attempts) for (const id of a.taskIds) last.set(id, Math.max(last.get(id) ?? 0, Date.parse(a.startedAt)));
  const cutoff = now.getTime() - REPEAT_AFTER_DAYS * 86_400_000;
  const unseen = tasks.filter((t) => !last.has(t.id));
  const old = tasks.filter((t) => (last.get(t.id) ?? Infinity) < cutoff).sort((a, b) => last.get(a.id)! - last.get(b.id)!);
  return [...unseen, ...old];
}

/**
 * The most valuable topics to study next: weak tags (enough evidence, under 70%), ordered by how much
 * there is to gain. Each comes with its theory lesson and a fresh task that tests the same point — never
 * the same questions again straight away. Mock-test tasks are kept back for mocks.
 */
export function recommend(r: Readiness, lib: ExamLibrary = examLibrary, now = new Date()): Recommendation[] {
  const pool = tasksFor(r.exam, undefined, undefined, lib).filter((t) => t.kind !== "writing" && t.kind !== "speaking");
  const fresh = freshTasks(pool, r.attempts, now);
  const kept = new Set(mockSets(r.exam, lib).slice(-1)); // the last mock stays unseen for the final check
  return r.tags
    .filter((t) => t.n >= 3 && t.share < 0.7 && !t.tag.startsWith("write.") && !t.tag.startsWith("speak."))
    .map((t) => ({ t, gain: (1 - t.share) * Math.log2(t.n + 1) }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 5)
    .map(({ t }) => {
      const task =
        fresh.find((x) => x.set === "drill" && questionsOf(x).some((q) => q.tag === t.tag)) ??
        fresh.find((x) => !kept.has(x.set) && questionsOf(x).some((q) => q.tag === t.tag));
      return { tag: t.tag, share: t.share, n: t.n, lesson: lib.lessons.has(t.tag), taskId: task?.id ?? null };
    });
}

/* ───────────────────────── Roadmap ───────────────────────── */

export type PhaseId = "diagnostic" | "theory" | "practice" | "timed" | "final";
export type Phase = { id: PhaseId; done: boolean; progress: number; weeks: number | null };
export type Roadmap = { phases: Phase[]; current: PhaseId; daysLeft: number | null; today: TodayItem[] };
export type TodayItem =
  | { kind: "diagnostic" }
  | { kind: "guide"; paper: Paper; part: number }
  | { kind: "lesson"; tag: string; taskId: string | null }
  | { kind: "section"; taskId: string; paper: Paper; part: number }
  | { kind: "paper"; paper: Paper; set: string }
  | { kind: "mock"; set: string };

const OBJECTIVE: Paper[] = ["reading", "listening"];

/**
 * A five-phase plan driven by the exam date and the evidence so far. Phases complete on evidence, not on
 * time; when the date is close the plan moves to final revision and mocks regardless.
 */
export function roadmap(cert: CertGoal, r: Readiness, guidesRead: Set<string>, minutes: number, lib: ExamLibrary = examLibrary, now = new Date()): Roadmap {
  const spec = EXAMS[cert.exam];
  const parts = spec.papers.flatMap((p) => p.parts.map((x) => ({ paper: p.paper, part: x.part })));
  const daysLeft = cert.date ? Math.ceil((Date.parse(`${cert.date}T09:00:00`) - now.getTime()) / 86_400_000) : null;

  const diagnosticDone = r.attempts.some((a) => a.mode === "diagnostic");
  const guides = parts.filter((p) => guidesRead.has(`guide:${cert.exam}:${p.paper}:${p.part}`)).length / parts.length;
  const practised = parts.filter((p) => r.partStats.some((s) => s.paper === p.paper && s.part === p.part)).length / parts.length;
  const timedPapers = OBJECTIVE.filter((p) => r.attempts.some((a) => a.timed && (a.mode === "paper" || a.mode === "mock") && (a.paper === p || a.mode === "mock"))).length / OBJECTIVE.length;
  const mocks = Math.min(1, r.mocks.length / Math.max(1, mockSets(cert.exam, lib).length));

  const phases: Phase[] = [
    { id: "diagnostic", done: diagnosticDone, progress: diagnosticDone ? 1 : 0, weeks: null },
    { id: "theory", done: guides >= 1, progress: guides, weeks: null },
    { id: "practice", done: practised >= 1, progress: practised, weeks: null },
    { id: "timed", done: timedPapers >= 1, progress: timedPapers, weeks: null },
    { id: "final", done: mocks >= 1, progress: mocks, weeks: null },
  ];
  // Split the remaining weeks: theory 20%, practice 40%, timed 20%, final 20% (at least the last 2 weeks).
  if (daysLeft !== null && daysLeft > 0) {
    const w = daysLeft / 7;
    const final = Math.max(2, w * 0.2);
    const rest = Math.max(0, w - final);
    phases[1].weeks = Math.round(rest * 0.25 * 10) / 10;
    phases[2].weeks = Math.round(rest * 0.5 * 10) / 10;
    phases[3].weeks = Math.round(rest * 0.25 * 10) / 10;
    phases[4].weeks = Math.round(Math.min(w, final) * 10) / 10;
  }
  let current = phases.find((p) => !p.done)?.id ?? "final";
  if (diagnosticDone && daysLeft !== null && daysLeft <= 14) current = "final";

  // Today's plan: about 15 minutes per item.
  const slots = Math.max(1, Math.round(minutes / 15));
  const today: TodayItem[] = [];
  const fresh = freshTasks(tasksFor(cert.exam, undefined, undefined, lib).filter((t) => t.set === "drill" || t.set === mockSets(cert.exam, lib)[0]), r.attempts, now);
  if (!diagnosticDone) today.push({ kind: "diagnostic" });
  const recs = recommend(r, lib, now);
  for (const rec of recs) if (today.length < slots && (rec.lesson || rec.taskId)) today.push({ kind: "lesson", tag: rec.tag, taskId: rec.taskId });
  if (current === "theory" || current === "practice") {
    const nextGuide = parts.find((p) => !guidesRead.has(`guide:${cert.exam}:${p.paper}:${p.part}`));
    if (nextGuide && today.length < slots) today.push({ kind: "guide", ...nextGuide });
    const unpractised = parts.filter((p) => !r.partStats.some((s) => s.paper === p.paper && s.part === p.part));
    for (const p of unpractised) {
      if (today.length >= slots + 1) break;
      const t = fresh.find((x) => x.paper === p.paper && x.part === p.part);
      if (t) today.push({ kind: "section", taskId: t.id, paper: p.paper, part: p.part });
    }
  }
  if (current === "timed" && today.length < slots + 1) {
    const paper = OBJECTIVE.find((p) => !r.attempts.some((a) => a.timed && a.paper === p)) ?? "reading";
    today.push({ kind: "paper", paper, set: mockSets(cert.exam, lib)[0] ?? "mock-1" });
  }
  if (current === "final") {
    const next = mockSets(cert.exam, lib).find((s) => !r.mocks.some((m) => m.set === s));
    if (next) today.push({ kind: "mock", set: next });
  }
  // Fill remaining time with the weakest part's fresh practice.
  const weakPart = [...r.partStats].sort((a, b) => a.share - b.share)[0];
  if (today.length < slots && weakPart) {
    const t = fresh.find((x) => x.paper === weakPart.paper && x.part === weakPart.part && !today.some((i) => "taskId" in i && i.taskId === x.id));
    if (t) today.push({ kind: "section", taskId: t.id, paper: t.paper, part: t.part });
  }
  return { phases, current, daysLeft, today };
}

/**
 * The exam diagnostic: one short task from each Use of English part and one reading text, taken from
 * drill material so the mock tests stay unseen.
 */
export function diagnosticTasks(exam: CertGoal["exam"], lib: ExamLibrary = examLibrary): ExamTask[] {
  const pick = (part: number, paper: Paper = "reading") =>
    tasksFor(exam, paper, part, lib).find((t) => t.set === "drill") ?? tasksFor(exam, paper, part, lib).find((t) => t.set === "mock-2");
  return [pick(1), pick(2), pick(3), pick(4), pick(5)].filter((t): t is ExamTask => !!t);
}
