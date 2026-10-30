import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db, type CertExam } from "../../db/db";
import { examLibrary, tasksFor } from "../../content/exams";
import type { ExamTask, Paper } from "../../content/exams/schema";
import { EXAMS } from "../../content/exams/spec";
import { finishAttempt, saveDraft, startAttempt, type SpeakingMark, type WritingMark } from "../../engine/exam/record";
import { diagnosticTasks } from "../../engine/exam/plan";
import { checkWriting, type Subscale } from "../../engine/exam/writing";
import { stopSpeaking } from "../../lib/speech";
import { useProfile } from "../../state/profile";
import { TaskView } from "./TaskView";
import { SpeakingAssessment, SpeakingTaskView, SPEAKING_CRITERIA, WritingAssessment, WritingTaskView, type SpeakingTurn } from "./ProductiveTasks";
import type { StringKey } from "../../i18n/strings";
import "./exam.css";

type Mode = "topic" | "section" | "paper" | "mock" | "diagnostic";
const PAPER_ORDER: Paper[] = ["reading", "writing", "listening", "speaking"];

/** Which tasks a run contains, from the URL. */
function plan(exam: CertExam, mode: Mode, params: URLSearchParams): ExamTask[] {
  const set = params.get("set") ?? "mock-1";
  if (mode === "diagnostic") return diagnosticTasks(exam);
  if (mode === "mock") return PAPER_ORDER.flatMap((p) => tasksFor(exam, p).filter((t) => t.set === set).sort((a, b) => a.part - b.part || a.id.localeCompare(b.id)));
  if (mode === "paper") return tasksFor(exam, params.get("paper") as Paper).filter((t) => t.set === set).sort((a, b) => a.part - b.part || a.id.localeCompare(b.id));
  const ids = (params.get("tasks") ?? "").split(",");
  return ids.map((id) => examLibrary.tasks.get(id)).filter((t): t is ExamTask => !!t && t.exam === exam);
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ExamRunner() {
  const { t, profile } = useProfile();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const exam = (profile?.cert?.exam ?? "b2-first") as CertExam;
  const mode = (params.get("mode") ?? "section") as Mode;
  const timed = mode === "paper" || mode === "mock" || params.get("timed") === "1";
  const tasks = useMemo(() => plan(exam, mode, params), [exam, mode, params]);
  const papers = useMemo(() => PAPER_ORDER.filter((p) => tasks.some((x) => x.paper === p)), [tasks]);

  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [paperIdx, setPaperIdx] = useState(0);
  const [taskIdx, setTaskIdx] = useState(0);
  const [elapsed, setElapsed] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<"work" | "assess" | "saving">("work");
  const [writingMarks, setWritingMarks] = useState<Record<string, Record<Subscale, number>>>({});
  const [speakingMarks, setSpeakingMarks] = useState<Record<string, number>>({});
  const [skipped, setSkipped] = useState<Set<Paper>>(new Set());
  const [notice, setNotice] = useState("");
  const started = useRef(false);

  // Create the attempt, or resume an unfinished one for the same tasks.
  useEffect(() => {
    if (started.current || !tasks.length || !profile) return;
    started.current = true;
    void (async () => {
      const ids = tasks.map((x) => x.id);
      const open = (await db.examAttempts.where("exam").equals(exam).toArray())
        .filter((a) => !a.finishedAt && a.mode === mode && a.taskIds.join() === ids.join())
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
      if (open?.id) {
        setAttemptId(open.id);
        setAnswers(open.draft ?? {});
        setElapsed(JSON.parse(open.draft?.__meta?.elapsed ?? "{}"));
        setNotice(t("exam.resumed"));
        return;
      }
      const limit = timed ? papers.reduce((s, p) => s + EXAMS[exam].papers.find((x) => x.paper === p)!.minutes * 60, 0) : undefined;
      setAttemptId(await startAttempt({ exam, mode, paper: papers.length === 1 ? papers[0] : undefined, set: params.get("set") ?? undefined, taskIds: ids, timed, limitSeconds: limit }));
    })();
  }, [tasks, profile, exam, mode, timed, papers, params, t]);

  const paper = papers[paperIdx];
  const paperTasks = tasks.filter((x) => x.paper === paper);
  const task = paperTasks[Math.min(taskIdx, paperTasks.length - 1)];
  const limit = timed && paper ? EXAMS[exam].papers.find((x) => x.paper === paper)!.minutes * 60 : null;
  const spent = elapsed[paper] ?? 0;

  // Clock: one second at a time for the current paper; saved with the draft every 10 s.
  useEffect(() => {
    if (phase !== "work" || !paper || attemptId === null) return;
    const id = window.setInterval(() => setElapsed((e) => ({ ...e, [paper]: (e[paper] ?? 0) + 1 })), 1000);
    return () => window.clearInterval(id);
  }, [phase, paper, attemptId]);
  const total = Object.values(elapsed).reduce((a, b) => a + b, 0);
  useEffect(() => {
    if (attemptId !== null && total % 10 === 0 && total > 0) void saveDraft(attemptId, { ...answers, __meta: { elapsed: JSON.stringify(elapsed) } }, total);
  }, [total, attemptId, answers, elapsed]);

  const nextPaper = useCallback(() => {
    stopSpeaking();
    setTaskIdx(0);
    if (paperIdx + 1 < papers.length) setPaperIdx((i) => i + 1);
    else setPhase(tasks.some((x) => x.kind === "writing" || x.kind === "speaking") ? "assess" : "saving");
  }, [paperIdx, papers.length, tasks]);

  // Time up: the paper ends, as in the real exam.
  useEffect(() => {
    if (limit !== null && spent >= limit && phase === "work") {
      setNotice(t("exam.timeUp"));
      nextPaper();
    }
  }, [limit, spent, phase, nextPaper, t]);

  const answer = (taskId: string) => (n: number | string, v: string) => setAnswers((a) => ({ ...a, [taskId]: { ...(a[taskId] ?? {}), [n]: v } }));

  // Writing Part 2: only the task the learner chose (the one they wrote) counts.
  const writtenTasks = tasks.filter((x) => x.kind === "writing" && (answers[x.id]?.text ?? "").trim().length > 0);
  const speakingTasks = tasks.filter((x) => x.kind === "speaking" && !skipped.has("speaking") && JSON.parse(answers[x.id]?.turns ?? "[]").length > 0);

  const submit = useCallback(async () => {
    if (attemptId === null) return;
    setPhase("saving");
    stopSpeaking();
    const counted = tasks.filter((x) => (x.kind !== "writing" && x.kind !== "speaking") || writtenTasks.includes(x) || speakingTasks.includes(x));
    const writing: WritingMark[] = writtenTasks.map((x) => {
      const text = answers[x.id]?.text ?? "";
      const auto = checkWriting(x as Extract<ExamTask, { kind: "writing" }>, text).indicator;
      const self = writingMarks[x.id];
      return { taskId: x.id, text, marks: self ?? auto, source: self ? "self" : "auto" };
    });
    const crit = SPEAKING_CRITERIA[exam];
    const speaking: SpeakingMark[] = speakingTasks.length && crit.every((c) => typeof speakingMarks[c] === "number")
      ? speakingTasks.map((x) => ({ taskId: x.id, criteria: Object.fromEntries(crit.map((c) => [c, speakingMarks[c]])) }))
      : [];
    const responses = Object.fromEntries(Object.entries(answers).filter(([k]) => k !== "__meta"));
    await finishAttempt(attemptId, counted, responses, { writing, speaking, seconds: total });
    navigate(`/exam/result/${attemptId}`, { replace: true });
  }, [attemptId, tasks, writtenTasks, speakingTasks, answers, writingMarks, speakingMarks, exam, total, navigate]);

  useEffect(() => {
    if (phase === "saving") void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!profile?.cert) return <div className="page"><p>{t("exam.noGoal")}</p></div>;
  if (!tasks.length) return <div className="page"><p>{t("exam.noTasks")}</p></div>;
  if (attemptId === null || phase === "saving") return <div className="page" aria-busy="true"><p>{t("exam.saving")}</p></div>;

  if (phase === "assess") {
    const crit = SPEAKING_CRITERIA[exam];
    const speakingReady = !speakingTasks.length || crit.every((c) => typeof speakingMarks[c] === "number");
    return (
      <div className="page ex-page">
        <h1 className="page-title">{t("exam.assessTitle")}</h1>
        <p className="page-lead">{t("exam.assessLead")}</p>
        {writtenTasks.map((x) => (
          <WritingAssessment
            key={x.id}
            task={x as Extract<ExamTask, { kind: "writing" }>}
            text={answers[x.id]?.text ?? ""}
            marks={writingMarks[x.id] ?? null}
            onMarks={(m) => setWritingMarks((w) => (w[x.id] && JSON.stringify(w[x.id]) === JSON.stringify(m) ? w : { ...w, [x.id]: m }))}
          />
        ))}
        {speakingTasks.length > 0 && <SpeakingAssessment exam={exam} marks={speakingMarks} onMarks={setSpeakingMarks} />}
        <button type="button" className="btn btn-primary" disabled={!speakingReady} onClick={() => setPhase("saving")}>{t("exam.seeResults")}</button>
      </div>
    );
  }

  const isLastTask = taskIdx >= paperTasks.length - 1;
  const paperName = EXAMS[exam].papers.find((p) => p.paper === paper)!.name;
  const writingPart2 = paper === "writing" ? paperTasks.filter((x) => x.part === 2) : [];
  return (
    <div className="page ex-page ex-runner">
      <header className="ex-bar">
        <button type="button" className="btn btn-quiet btn-small" onClick={() => { stopSpeaking(); void saveDraft(attemptId, { ...answers, __meta: { elapsed: JSON.stringify(elapsed) } }, total); navigate("/exam"); }}>{t("exam.saveExit")}</button>
        <div className="ex-bar-title">
          <strong>{EXAMS[exam].name}</strong> · {paperName}
          {papers.length > 1 && <span className="card-meta"> · {t("exam.paperOf", { n: String(paperIdx + 1), total: String(papers.length) })}</span>}
        </div>
        <span className={`ex-timer ${limit !== null && limit - spent < 300 ? "ex-timer-low" : ""}`} role="timer" aria-label={limit !== null ? t("exam.timeLeft") : t("exam.timeSpent")}>
          {limit !== null ? fmt(Math.max(0, limit - spent)) : fmt(spent)}
        </span>
      </header>
      {notice && <p className="banner banner-info" role="status">{notice}</p>}
      {paperTasks.length > 1 && (
        <nav className="ex-tabs" aria-label={t("exam.parts")}>
          {paperTasks.map((x, i) => (
            <button key={x.id} type="button" className="chip" aria-pressed={i === taskIdx} onClick={() => { stopSpeaking(); setTaskIdx(i); }}>
              {x.kind === "writing" && x.part === 2 ? t("exam.writingOption", { n: String(writingPart2.indexOf(x) + 2) }) : t("exam.partN", { n: String(x.part) })}
            </button>
          ))}
        </nav>
      )}
      {paper === "writing" && writingPart2.length > 1 && <p className="setting-hint">{t("exam.chooseOne")}</p>}
      {paper === "speaking" && (
        <p className="setting-hint">
          {t("exam.speakingIntro")}{" "}
          <button type="button" className="btn btn-quiet btn-small" onClick={() => { setSkipped((s) => new Set(s).add("speaking")); nextPaper(); }}>{t("exam.skipSpeaking")}</button>
        </p>
      )}
      {task.kind === "writing" ? (
        <WritingTaskView key={task.id} task={task} text={answers[task.id]?.text ?? ""} onChange={(v) => answer(task.id)("text", v)} />
      ) : task.kind === "speaking" ? (
        <SpeakingTaskView key={task.id} task={task} turns={JSON.parse(answers[task.id]?.turns ?? "[]")} onTurn={(tn: SpeakingTurn) => answer(task.id)("turns", JSON.stringify([...JSON.parse(answers[task.id]?.turns ?? "[]").filter((x: SpeakingTurn) => x.line !== tn.line), tn]))} />
      ) : (
        <TaskView key={task.id} task={task} answers={answers[task.id] ?? {}} onAnswer={answer(task.id)} examConditions={timed && task.paper === "listening"} />
      )}
      <footer className="ex-footer">
        {taskIdx > 0 && <button type="button" className="btn btn-quiet" onClick={() => { stopSpeaking(); setTaskIdx((i) => i - 1); }}>{t("exam.prev")}</button>}
        {!isLastTask ? (
          <button type="button" className="btn btn-primary" onClick={() => { stopSpeaking(); setTaskIdx((i) => i + 1); }}>{t("exam.next")}</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={nextPaper}>
            {paperIdx + 1 < papers.length ? t("exam.finishPaper") : t("exam.submit")}
          </button>
        )}
      </footer>
      <p className="setting-hint">{t(`exam.mode.${mode}` as StringKey)}</p>
    </div>
  );
}
