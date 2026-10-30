import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import type { CertExam, Profile } from "../../db/db";
import { examLibrary, guideFor, mockSets, tasksFor } from "../../content/exams";
import { EXAMS, SKILLS, type Skill } from "../../content/exams/spec";
import { EXAM_TAGS } from "../../content/exams/tags";
import { resourcesFor } from "../../content/exams/resources";
import { readiness } from "../../engine/exam/readiness";
import { freshTasks, recommend, roadmap, type TodayItem } from "../../engine/exam/plan";
import { useProfile } from "../../state/profile";
import type { StringKey } from "../../i18n/strings";
import { Resources } from "./Resources";
import { CertSetup } from "./CertSetup";
import "./exam.css";

/* ───────────────────────── Dashboard ───────────────────────── */

function SkillBar({ exam, skill, est }: { exam: CertExam; skill: Skill; est: Awaited<ReturnType<typeof readiness>>["skills"][Skill] }) {
  const { t } = useProfile();
  const spec = EXAMS[exam];
  const lo = spec.reportedFrom, hi = spec.grades[0].max;
  const pos = (v: number) => `${((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100}%`;
  return (
    <li className="ex-skill">
      <span className="ex-skill-name">{t(`exam.skill.${skill}` as StringKey)}</span>
      {est.scale === null ? (
        <span className="card-meta ex-skill-none">{t("exam.notEnough")}</span>
      ) : (
        <>
          <span className="ex-skill-track" aria-hidden="true">
            {spec.grades.slice(0, 3).map((g) => <span key={g.label} className="ex-boundary" style={{ left: pos(g.min) }} />)}
            <span className="ex-skill-range" style={{ left: pos(est.low!), width: `calc(${pos(est.high!)} - ${pos(est.low!)})` }} />
            <span className="ex-skill-dot" style={{ left: pos(est.scale) }} />
          </span>
          <span className="ex-skill-val">{est.scale} <span className="card-meta">({est.low}–{est.high})</span></span>
        </>
      )}
    </li>
  );
}

function todayLink(exam: CertExam, i: TodayItem): { to: string; label: StringKey; vars: Record<string, string> } {
  switch (i.kind) {
    case "diagnostic": return { to: "/exam/run?mode=diagnostic", label: "exam.today.diagnostic", vars: {} };
    case "guide": return { to: `/exam/guide/${i.paper}/${i.part}`, label: "exam.today.guide", vars: { paper: EXAMS[exam].papers.find((p) => p.paper === i.paper)!.name, part: String(i.part) } };
    case "lesson": return { to: `/exam/lesson/${i.tag}`, label: "exam.today.lesson", vars: { topic: EXAM_TAGS[i.tag as keyof typeof EXAM_TAGS] ?? i.tag } };
    case "section": return { to: `/exam/run?mode=section&tasks=${i.taskId}`, label: "exam.today.section", vars: { paper: EXAMS[exam].papers.find((p) => p.paper === i.paper)!.name, part: String(i.part) } };
    case "paper": return { to: `/exam/run?mode=paper&paper=${i.paper}&set=${i.set}`, label: "exam.today.paper", vars: { paper: EXAMS[exam].papers.find((p) => p.paper === i.paper)!.name } };
    case "mock": return { to: `/exam/run?mode=mock&set=${i.set}`, label: "exam.today.mock", vars: {} };
  }
}

export function ExamHome() {
  const { t, profile, update } = useProfile();
  const cert = profile?.cert;
  const data = useLiveQuery(async () => (cert ? { r: await readiness(cert.exam, cert.target), now: Date.now() } : null), [cert?.exam, cert?.target]);

  if (!profile) return <div className="page" aria-busy="true" />;
  if (!cert || profile.track !== "exam") {
    return (
      <div className="page ex-page">
        <h1 className="page-title">{t("exam.title")}</h1>
        <p className="page-lead">{t("exam.setup.lead")}</p>
        <CertSetup initial={cert} onSave={(c) => update({ cert: c, track: "exam", goal: "exam" } as Partial<Profile>)} />
      </div>
    );
  }
  if (!data) return <div className="page" aria-busy="true" />;
  const { r, now } = data;
  const spec = EXAMS[cert.exam];
  const guidesRead = new Set(profile.seenNotes.filter((n) => n.startsWith("guide:")));
  const map = roadmap(cert, r, guidesRead, profile.dailyMinutes ?? 30, examLibrary, new Date(now));
  const recs = recommend(r, examLibrary, new Date(now));
  const targetGrade = spec.grades.find((g) => cert.target !== undefined && cert.target >= g.min && cert.target <= g.max);

  return (
    <div className="page ex-page">
      <header className="ex-head">
        <p className="card-meta">{t("exam.preparingFor")}</p>
        <h1 className="page-title">{spec.name} <span className="card-meta">({spec.short})</span></h1>
        <p className="ex-head-meta">
          {map.daysLeft !== null ? (map.daysLeft >= 0 ? t("exam.daysLeft", { n: String(map.daysLeft) }) : t("exam.datePassed")) : t("exam.noDate")}
          {cert.target && <> · {t("exam.targetScore", { n: String(cert.target), grade: targetGrade?.label ?? "" })}</>}
          {cert.format && <> · {t(`exam.setup.${cert.format}` as StringKey)}</>}
        </p>
      </header>

      <div className="dash-grid">
        <div className="dash-main">
          <section className="card" aria-labelledby="ex-today">
            <h2 id="ex-today" className="section-title">{t("exam.todayTitle")}</h2>
            <ol className="plan-list">
              {map.today.map((i, k) => {
                const l = todayLink(cert.exam, i);
                return (
                  <li key={k} className="plan-item">
                    <span className="plan-dot" aria-hidden="true" />
                    <Link className="plan-link" to={l.to}>{t(l.label, l.vars)}</Link>
                  </li>
                );
              })}
            </ol>
            {map.today[0] && <Link className="btn btn-primary" to={todayLink(cert.exam, map.today[0]).to}>{t("exam.startNext")}</Link>}
          </section>

          <section className="card" aria-labelledby="ex-ready">
            <div className="card-head">
              <h2 id="ex-ready" className="section-title">{t("exam.readiness")}</h2>
              <span className="pill">{t("exam.estimate")}</span>
            </div>
            {r.overall ? (
              <p className="ex-overall">
                <span className="ex-overall-num">{r.overall.scale}</span>
                <span className="card-meta">{t("exam.range", { low: String(r.overall.low), high: String(r.overall.high) })}{r.overall.grade ? ` · ${r.overall.grade}` : ""}</span>
              </p>
            ) : (
              <p className="setting-hint">{t("exam.overallNeeds")}</p>
            )}
            <ul className="ex-skills">{SKILLS.map((s) => <SkillBar key={s} exam={cert.exam} skill={s} est={r.skills[s]} />)}</ul>
            <p className="setting-hint">{t("exam.estimateNote")}</p>
          </section>

          <section className="card" aria-labelledby="ex-practice">
            <h2 id="ex-practice" className="section-title">{t("exam.practiceTitle")}</h2>
            {spec.papers.map((p) => (
              <div key={p.paper} className="ex-paper">
                <h3 className="mini-title">{p.name} <span className="card-meta">{t("exam.minutes", { n: String(p.minutes) })}</span></h3>
                <ul className="ex-parts">
                  {p.parts.map((part) => {
                    const stat = r.partStats.find((s) => s.paper === p.paper && s.part === part.part);
                    const pool = tasksFor(cert.exam, p.paper, part.part).filter((x) => x.set !== mockSets(cert.exam).at(-1));
                    const next = freshTasks(pool, r.attempts, new Date(now))[0] ?? pool[0];
                    return (
                      <li key={part.part} className="ex-part">
                        <div>
                          <span className="ex-part-name">{t("exam.partN", { n: String(part.part) })} · {part.name}</span>
                          <span className="card-meta">{stat ? t("exam.partStat", { pct: String(Math.round(stat.share * 100)), n: String(stat.n) }) : t("exam.notYet")}</span>
                        </div>
                        <div className="ex-part-actions">
                          {guideFor(cert.exam, p.paper, part.part) && <Link className="btn btn-quiet btn-small" to={`/exam/guide/${p.paper}/${part.part}`}>{t("exam.theory")}</Link>}
                          {next && <Link className="btn btn-quiet btn-small" to={`/exam/run?mode=section&tasks=${next.id}`}>{t("exam.practise")}</Link>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {mockSets(cert.exam).length > 0 && p.paper !== "speaking" && (
                  <Link className="btn btn-quiet btn-small" to={`/exam/run?mode=paper&paper=${p.paper}&set=${mockSets(cert.exam)[0]}`}>{t("exam.timedPaper", { min: String(p.minutes) })}</Link>
                )}
              </div>
            ))}
          </section>
        </div>

        <div className="dash-side">
          <section className="card" aria-labelledby="ex-road">
            <h2 id="ex-road" className="section-title">{t("exam.roadmap")}</h2>
            <ol className="ex-phases">
              {map.phases.map((ph, i) => (
                <li key={ph.id} className="ex-phase" data-done={ph.done} data-current={map.current === ph.id}>
                  <span className="ex-phase-n">{i + 1}</span>
                  <div>
                    <p className="ex-phase-name">{t(`exam.phase.${ph.id}` as StringKey)}</p>
                    <p className="card-meta">
                      {Math.round(ph.progress * 100)}%{ph.weeks !== null && !ph.done ? ` · ${t("exam.weeks", { n: String(ph.weeks) })}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card" aria-labelledby="ex-weak">
            <h2 id="ex-weak" className="section-title">{t("exam.weakTitle")}</h2>
            {recs.length ? (
              <ul className="tag-list">
                {recs.map((x) => (
                  <li key={x.tag}>
                    <Link to={`/exam/lesson/${x.tag}`}>{EXAM_TAGS[x.tag as keyof typeof EXAM_TAGS] ?? x.tag}</Link>{" "}
                    <span className="card-meta">{Math.round(x.share * 100)}% · {x.n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="setting-hint">{t("exam.weakNone")}</p>
            )}
            {r.skills.writing.questions > 0 && (
              <p className="card-meta">{t("exam.writingAvg", { n: String(Math.round((r.skills.writing.share ?? 0) * 20 * 10) / 10) })}</p>
            )}
          </section>

          <section className="card" aria-labelledby="ex-mocks">
            <h2 id="ex-mocks" className="section-title">{t("exam.mocks")}</h2>
            <ul className="lib-links">
              {mockSets(cert.exam).map((s, i) => {
                const done = r.mocks.filter((m) => m.set === s);
                return (
                  <li key={s}>
                    <Link to={`/exam/run?mode=mock&set=${s}`}>{t("exam.mockN", { n: String(i + 1) })}</Link>
                    {done[0] ? <Link className="card-meta" to={`/exam/result/${done[0].id}`}>{t("exam.mockDone")}</Link> : <span className="card-meta">{t("exam.mockTime")}</span>}
                  </li>
                );
              })}
            </ul>
            <p className="setting-hint">{t("exam.mockHint")}</p>
          </section>

          <section className="card" aria-labelledby="ex-hist">
            <h2 id="ex-hist" className="section-title">{t("exam.history")}</h2>
            {r.attempts.length ? (
              <ul className="lib-links">
                {r.attempts.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link to={`/exam/result/${a.id}`}>{t(`exam.mode.short.${a.mode}` as StringKey)}</Link>
                    <span className="card-meta">{new Date(a.startedAt).toLocaleDateString()} · {Object.values(a.skills ?? {}).reduce((s, x) => s + x.raw, 0)}/{Object.values(a.skills ?? {}).reduce((s, x) => s + x.max, 0)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="setting-hint">{t("exam.historyNone")}</p>
            )}
          </section>

          <section className="card" aria-labelledby="ex-res">
            <h2 id="ex-res" className="section-title">{t("exam.resources")}</h2>
            <Resources items={resourcesFor(cert.exam).filter((x) => x.kind !== "video")} />
            <p className="setting-hint">{t("exam.contentNote", { n: String(examLibrary.tasks.size) })}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
