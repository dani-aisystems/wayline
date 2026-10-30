import { db, type CertExam, type ExamAnswerRow, type ExamAttemptRow, type WaylineDB } from "../../db/db";
import { EXAMS, SKILLS, gradeFor, toScale, type Skill } from "../../content/exams/spec";

/**
 * Exam readiness from stored practice evidence only. Each skill's estimate projects the recency-weighted
 * share of marks earned onto the paper's raw total, then converts with Cambridge's practice-test table.
 * It is an estimate with a stated range — never an official result.
 */
export type SkillEstimate = {
  skill: Skill;
  questions: number;
  share: number | null;
  scale: number | null;
  low: number | null;
  high: number | null;
  trend: number | null; // change in share: recent half vs earlier half
  timedShare: number | null;
};

export type TagStat = { tag: string; n: number; share: number; lastAt: string };

export type Readiness = {
  exam: CertExam;
  skills: Record<Skill, SkillEstimate>;
  overall: { scale: number; low: number; high: number; grade: string | null } | null;
  target: number | null;
  /** Share of target reached on the overall estimate (0–1), or null. */
  progress: number | null;
  tags: TagStat[];
  partStats: { paper: string; part: number; n: number; share: number; secondsPerQuestion: number | null }[];
  attempts: ExamAttemptRow[];
  mocks: ExamAttemptRow[];
};

const MIN_MARKS: Record<Skill, number> = { reading: 8, useOfEnglish: 8, writing: 5, listening: 8, speaking: 5 };

function weighted(rows: ExamAnswerRow[]) {
  // Newest first; each older answer counts 0.97× the next newer one.
  const sorted = [...rows].sort((a, b) => b.at.localeCompare(a.at) || b.n - a.n);
  let w = 0, earned = 0, possible = 0, w2 = 0;
  sorted.forEach((r, k) => {
    const wt = 0.97 ** k;
    earned += wt * r.marks;
    possible += wt * r.max;
    w += wt;
    w2 += wt * wt;
  });
  return { share: possible ? earned / possible : null, neff: w2 ? (w * w) / w2 : 0 };
}

export function estimateSkill(exam: CertExam, skill: Skill, rows: ExamAnswerRow[]): SkillEstimate {
  const mine = rows.filter((r) => r.skill === skill);
  const totalMax = mine.reduce((s, r) => s + r.max, 0);
  const base: SkillEstimate = { skill, questions: mine.length, share: null, scale: null, low: null, high: null, trend: null, timedShare: null };
  if (totalMax < MIN_MARKS[skill]) return base;
  const { share, neff } = weighted(mine);
  if (share === null) return base;
  const max = EXAMS[exam].maxRaw[skill];
  // Writing and speaking marks are 0–5 per criterion; their spread is wider, so use fewer effective points.
  const n = skill === "writing" || skill === "speaking" ? Math.max(1, neff / 4) : neff;
  const se = Math.sqrt(Math.max(share * (1 - share), 0.04) / n);
  const at = (p: number) => toScale(exam, skill, Math.round(Math.max(0, Math.min(1, p)) * max));
  const sorted = [...mine].sort((a, b) => a.at.localeCompare(b.at));
  const half = Math.floor(sorted.length / 2);
  const share2 = (rs: ExamAnswerRow[]) => (rs.length ? rs.reduce((s, r) => s + r.marks, 0) / Math.max(1, rs.reduce((s, r) => s + r.max, 0)) : null);
  const early = share2(sorted.slice(0, half));
  const late = share2(sorted.slice(half));
  const timed = mine.filter((r) => r.timed);
  return {
    ...base,
    share,
    scale: at(share),
    low: at(share - 1.64 * se),
    high: at(share + 1.64 * se),
    trend: sorted.length >= 12 && early !== null && late !== null ? late - early : null,
    timedShare: timed.length >= 6 ? share2(timed) : null,
  };
}

export async function readiness(exam: CertExam, target?: number, database: WaylineDB = db): Promise<Readiness> {
  const [answers, attempts] = await Promise.all([
    database.examAnswers.where("exam").equals(exam).toArray(),
    database.examAttempts.where("exam").equals(exam).toArray(),
  ]);
  const done = attempts.filter((a) => a.finishedAt);
  const skills = Object.fromEntries(SKILLS.map((s) => [s, estimateSkill(exam, s, answers)])) as Record<Skill, SkillEstimate>;
  const measured = SKILLS.map((s) => skills[s]);
  const overall = measured.every((m) => m.scale !== null)
    ? (() => {
        const avg = (k: "scale" | "low" | "high") => Math.round(measured.reduce((a, m) => a + (m[k] as number), 0) / measured.length);
        const scale = avg("scale");
        return { scale, low: avg("low"), high: avg("high"), grade: gradeFor(exam, scale)?.label ?? null };
      })()
    : null;

  const tagMap = new Map<string, TagStat & { earned: number; possible: number }>();
  for (const r of answers) {
    const t = tagMap.get(r.tag) ?? { tag: r.tag, n: 0, share: 0, lastAt: r.at, earned: 0, possible: 0 };
    t.n++;
    t.earned += r.marks;
    t.possible += r.max;
    if (r.at > t.lastAt) t.lastAt = r.at;
    tagMap.set(r.tag, t);
  }
  const tags = [...tagMap.values()].map(({ earned, possible, ...t }) => ({ ...t, share: possible ? earned / possible : 0 })).sort((a, b) => a.share - b.share || b.n - a.n);

  const partMap = new Map<string, { paper: string; part: number; n: number; earned: number; possible: number }>();
  for (const r of answers) {
    const k = `${r.paper}:${r.part}`;
    const p = partMap.get(k) ?? { paper: r.paper, part: r.part, n: 0, earned: 0, possible: 0 };
    p.n++;
    p.earned += r.marks;
    p.possible += r.max;
    partMap.set(k, p);
  }
  const secondsFor = (paper: string, part: number) => {
    const rows = done.filter((a) => a.mode === "section" && a.taskIds.length === 1 && a.seconds > 0 && answers.some((r) => r.attemptId === a.id && r.paper === paper && r.part === part));
    const qs = rows.reduce((s, a) => s + answers.filter((r) => r.attemptId === a.id).length, 0);
    return qs ? Math.round(rows.reduce((s, a) => s + a.seconds, 0) / qs) : null;
  };
  const partStats = [...partMap.values()].map((p) => ({ paper: p.paper, part: p.part, n: p.n, share: p.possible ? p.earned / p.possible : 0, secondsPerQuestion: secondsFor(p.paper, p.part) }));

  return {
    exam,
    skills,
    overall,
    target: target ?? null,
    progress: overall && target ? Math.min(1, overall.scale / target) : null,
    tags,
    partStats,
    attempts: done.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    mocks: done.filter((a) => a.mode === "mock").sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  };
}
