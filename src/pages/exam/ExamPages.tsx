import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Profile } from "../../db/db";
import { localize } from "../../content/schema";
import { examLibrary, guideFor, mockSets, questionsOf, tasksFor } from "../../content/exams";
import type { Paper } from "../../content/exams/schema";
import { EXAMS, gradeFor, overallScale, partSpec, toScale, type Skill } from "../../content/exams/spec";
import { EXAM_TAGS } from "../../content/exams/tags";
import { resourcesFor } from "../../content/exams/resources";
import { scoreTask } from "../../engine/exam/scoring";
import { freshTasks, recommend } from "../../engine/exam/plan";
import { readiness } from "../../engine/exam/readiness";
import { useProfile } from "../../state/profile";
import type { StringKey } from "../../i18n/strings";
import { LensText } from "../../components/lens/Lens";
import { TaskView } from "./TaskView";
import { Resources } from "./Resources";
import "./exam.css";

function Back() {
  const { t } = useProfile();
  return <Link className="lib-back" to="/exam">← {t("exam.title")}</Link>;
}

/* ───────────────────────── Part guide (theory) ───────────────────────── */

export function ExamGuide() {
  const { t, lang, profile, update } = useProfile();
  const { paper, part } = useParams();
  const exam = profile?.cert?.exam;
  const guide = exam ? guideFor(exam, paper as Paper, Number(part)) : undefined;
  const spec = exam ? partSpec(exam, paper as Paper, Number(part)) : undefined;
  const key = `guide:${exam}:${paper}:${part}`;
  useEffect(() => {
    if (profile && guide && !profile.seenNotes.includes(key)) void update({ seenNotes: [...profile.seenNotes, key] } as Partial<Profile>);
  }, [profile, guide, key, update]);
  const attempts = useLiveQuery(() => (exam ? db.examAttempts.where("exam").equals(exam).toArray() : []), [exam]);
  if (!exam || !spec) return <div className="page"><Back /><p>{t("exam.noTasks")}</p></div>;
  const pool = tasksFor(exam, paper as Paper, Number(part)).filter((x) => x.set !== mockSets(exam).at(-1));
  const next = freshTasks(pool, attempts ?? [])[0] ?? pool[0];
  const paperName = EXAMS[exam].papers.find((p) => p.paper === paper)!.name;
  return (
    <div className="page ex-page lib">
      <Back />
      <p className="card-meta">{EXAMS[exam].name} · {paperName}</p>
      <h1 className="page-title">{t("exam.partN", { n: String(part) })}: {spec.name}</h1>
      <p className="page-lead">{spec.focus}</p>
      <p className="card-meta">
        {spec.words ? t("exam.wordsRange", { lo: String(spec.words[0]), hi: String(spec.words[1]) }) : spec.to > spec.from ? t("exam.questionsMarks", { from: String(spec.from), to: String(spec.to), m: String(spec.marksPerQuestion) }) : ""}
      </p>
      {guide ? (
        <>
          <section className="card">
            <h2 className="section-title">{t("exam.guide.tests")}</h2>
            <p className="gram-body">{localize(guide.tests, lang)}</p>
          </section>
          <section className="card">
            <h2 className="section-title">{t("exam.guide.strategy")}</h2>
            <ol className="ex-steps">{guide.strategy.map((s, i) => <li key={i}>{localize(s, lang)}</li>)}</ol>
          </section>
          <section className="card">
            <h2 className="section-title">{t("exam.guide.example")}</h2>
            <p className="ex-prose" lang="en"><LensText text={guide.example.question} /></p>
            <ol className="ex-steps">{guide.example.steps.map((s, i) => <li key={i}>{localize(s, lang)}</li>)}</ol>
            <p><strong>{t("exam.key")}:</strong> <span lang="en">{guide.example.answer}</span></p>
          </section>
          <section className="card">
            <h2 className="section-title">{t("exam.guide.pitfalls")}</h2>
            <ul className="ex-steps">{guide.pitfalls.map((s, i) => <li key={i}>{localize(s, lang)}</li>)}</ul>
          </section>
        </>
      ) : (
        <p className="setting-hint">{t("exam.guide.none")}</p>
      )}
      {resourcesFor(exam, paper as Paper).length > 0 && (
        <section className="card">
          <h2 className="section-title">{t("exam.resources")}</h2>
          <Resources items={resourcesFor(exam, paper as Paper)} />
        </section>
      )}
      {next && <Link className="btn btn-primary" to={`/exam/run?mode=section&tasks=${next.id}`}>{t("exam.practiseThis")}</Link>}
    </div>
  );
}

/* ───────────────────────── Weakness lesson → retest ───────────────────────── */

export function ExamLesson() {
  const { t, lang, profile } = useProfile();
  const { tag = "" } = useParams();
  const exam = profile?.cert?.exam;
  const lesson = examLibrary.lessons.get(tag);
  const data = useLiveQuery(async () => (exam ? readiness(exam) : null), [exam]);
  if (!exam) return <div className="page"><Back /></div>;
  const rec = data ? recommend(data).find((r) => r.tag === tag) : undefined;
  const fallback = data
    ? freshTasks(tasksFor(exam).filter((x) => x.set !== mockSets(exam).at(-1) && questionsOf(x).some((q) => q.tag === tag)), data.attempts)[0]
    : undefined;
  const retest = rec?.taskId ?? fallback?.id;
  const stat = data?.tags.find((x) => x.tag === tag);
  return (
    <div className="page ex-page lib">
      <Back />
      <h1 className="page-title">{lesson ? localize(lesson.title, lang) : (EXAM_TAGS[tag as keyof typeof EXAM_TAGS] ?? tag)}</h1>
      {stat && <p className="card-meta">{t("exam.tagStat", { pct: String(Math.round(stat.share * 100)), n: String(stat.n) })}</p>}
      {lesson ? (
        <section className="card">
          <p className="gram-body">{localize(lesson.explanation, lang)}</p>
          <ul className="gram-examples">{lesson.examples.map((x) => <li key={x}><LensText text={x} /></li>)}</ul>
        </section>
      ) : (
        <p className="setting-hint">{t("exam.lessonNone")}</p>
      )}
      {retest ? (
        <Link className="btn btn-primary" to={`/exam/run?mode=topic&tasks=${retest}`}>{t("exam.retest")}</Link>
      ) : (
        <p className="setting-hint">{t("exam.retestNone")}</p>
      )}
    </div>
  );
}

/* ───────────────────────── Result report ───────────────────────── */

export function ExamResult() {
  const { t, lang } = useProfile();
  const { id } = useParams();
  const data = useLiveQuery(async () => {
    const attempt = await db.examAttempts.get(Number(id));
    if (!attempt) return null;
    const answers = await db.examAnswers.where("attemptId").equals(attempt.id!).toArray();
    const r = await readiness(attempt.exam);
    return { attempt, answers, r };
  }, [id]);
  if (data === undefined) return <div className="page" aria-busy="true" />;
  if (data === null) return <div className="page"><Back /><p>{t("exam.noTasks")}</p></div>;
  const { attempt, answers, r } = data;
  const spec = EXAMS[attempt.exam];
  const tasks = attempt.taskIds.map((x) => examLibrary.tasks.get(x)).filter((x) => !!x);
  const fullPaper = attempt.mode === "paper" || attempt.mode === "mock";
  const scores: Partial<Record<Skill, number>> = {};
  const skillRows = (Object.entries(attempt.skills ?? {}) as [Skill, { raw: number; max: number }][]).map(([skill, s]) => {
    const projected = Math.round((s.raw / Math.max(1, s.max)) * spec.maxRaw[skill]);
    const scale = toScale(attempt.exam, skill, fullPaper && s.max === spec.maxRaw[skill] ? s.raw : projected);
    scores[skill] = scale;
    return { skill, ...s, scale, exact: fullPaper && s.max === spec.maxRaw[skill] };
  });
  const overall = overallScale(scores);
  const missed = answers.filter((a) => a.max > 0 && a.marks < a.max && !a.tag.startsWith("write.") && !a.tag.startsWith("speak."));
  const byTag = new Map<string, number>();
  for (const m of missed) byTag.set(m.tag, (byTag.get(m.tag) ?? 0) + 1);
  const recs = recommend(r);
  const minutes = Math.round(attempt.seconds / 60);
  return (
    <div className="page ex-page">
      <Back />
      <h1 className="page-title">{t("exam.resultTitle")}</h1>
      <p className="page-lead">{t(`exam.mode.short.${attempt.mode}` as StringKey)} · {spec.name} · {t("exam.minutesSpent", { n: String(minutes) })}{attempt.timed ? ` · ${t("exam.timed")}` : ""}</p>

      <section className="card">
        <div className="card-head">
          <h2 className="section-title">{t("exam.scores")}</h2>
          <span className="pill">{t("exam.estimate")}</span>
        </div>
        <table className="ex-table">
          <thead><tr><th>{t("exam.col.skill")}</th><th>{t("exam.col.marks")}</th><th>{t("exam.col.scale")}</th></tr></thead>
          <tbody>
            {skillRows.map((s) => (
              <tr key={s.skill}>
                <td>{t(`exam.skill.${s.skill}` as StringKey)}</td>
                <td>{Math.round(s.raw * 10) / 10} / {s.max}</td>
                <td>{s.scale} <span className="card-meta">{s.exact ? t("exam.converted") : t("exam.projected")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {overall !== null && <p className="ex-overall"><span className="ex-overall-num">{overall}</span> <span className="card-meta">{gradeFor(attempt.exam, overall)?.label ?? t("exam.belowGrade")}</span></p>}
        <p className="setting-hint">{t("exam.estimateNote")}</p>
      </section>

      {byTag.size > 0 && (
        <section className="card">
          <h2 className="section-title">{t("exam.resultWeak")}</h2>
          <ul className="tag-list">
            {[...byTag].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag, n]) => (
              <li key={tag}><Link to={`/exam/lesson/${tag}`}>{EXAM_TAGS[tag as keyof typeof EXAM_TAGS] ?? tag}</Link> <span className="card-meta">{t("exam.missedN", { n: String(n) })}</span></li>
            ))}
          </ul>
          {recs[0] && <Link className="btn btn-primary btn-small" to={`/exam/lesson/${recs[0].tag}`}>{t("exam.studyWeakest")}</Link>}
        </section>
      )}

      <h2 className="section-title">{t("exam.review")}</h2>
      {tasks.map((task) => {
        if (task.kind === "writing") {
          const rows = answers.filter((a) => a.taskId === task.id);
          if (!rows.length) return null;
          const text = rows.find((x) => x.tag === "write.content")?.given ?? "";
          return (
            <section key={task.id} className="card">
              <p className="card-meta">{t("exam.writingPart", { part: String(task.part) })} · {task.title}</p>
              <div className="ex-prose" lang="en">{text.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</div>
              <p>{rows.map((x) => `${t(`exam.sub.${x.tag.slice(6)}` as StringKey)} ${x.marks}/5`).join(" · ")} <span className="card-meta">({rows[0].source === "self" ? t("exam.selfMarked") : t("exam.autoMarked")})</span></p>
              <details className="ex-model"><summary>{t("exam.model")}</summary><div className="ex-prose" lang="en">{task.model.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</div><p className="gram-body">{localize(task.modelNotes, lang)}</p></details>
            </section>
          );
        }
        if (task.kind === "speaking") {
          const row = answers.find((a) => a.taskId === task.id);
          return row ? <p key={task.id} className="card-meta">{t("exam.speakingPart", { part: String(task.part) })}: {row.marks}/5 ({t("exam.selfMarked")})</p> : null;
        }
        return (
          <TaskView key={task.id} task={task} answers={attempt.draft?.[task.id] ?? {}} onAnswer={() => {}} review={scoreTask(task, attempt.draft?.[task.id] ?? {})} />
        );
      })}
      <Link className="btn btn-primary" to="/exam">{t("exam.backHome")}</Link>
    </div>
  );
}
