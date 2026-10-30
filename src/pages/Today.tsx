import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { library } from "../content/library";
import { localize, type Skill } from "../content/schema";
import { dashboard, route, type Insight } from "../engine/dashboard";
import type { Phase, Reason } from "../engine/progress";
import { useProfile } from "../state/profile";
import { topicName } from "../i18n/topics";
import type { StringKey, UiLanguage } from "../i18n/strings";
import { SKILLS } from "../engine/learner";
import { EXAMS } from "../content/exams/spec";
import "./today.css";

const BACKUP_EVERY_DAYS = 14;
const label = (b?: string | null) => (b === "preA1" ? "Pre-A1" : (b ?? ""));
const MIN_PER: Record<Phase, number> = { warmup: 0.5, learn: 1.5, practice: 1.2, reinforce: 1.2, apply: 2 };

export function Today() {
  const { t, lang, profile } = useProfile();
  const [fullRoute, setFullRoute] = useState(false);
  const data = useLiveQuery(async () => (profile ? { ...(await dashboard(profile)), now: Date.now() } : null), [profile]);
  if (!profile || !data) return <div className="page" aria-busy="true" />;

  const { plan, model, xp, progress } = data;
  const current = plan.competenceId ? library.competence.get(plan.competenceId) : undefined;
  const cp = current ? progress.get(current.id) : undefined;
  const skillName = (k: string) => t(`skill.${k}` as StringKey).toLowerCase();

  // A — welcome and focus, from the plan's own reasons.
  const hour = new Date(data.now).getHours();
  const greet = t(hour < 12 ? "dash.morning" : hour < 18 ? "dash.afternoon" : "dash.evening");
  const focus: string[] = [];
  for (const r of plan.reasons) {
    if (r.kind === "reinforce") focus.push(topicName(r.tag, lang));
    if (r.kind === "new" && r.because === "priority" && r.skill) focus.push(skillName(r.skill));
    if (r.kind === "new" && r.because !== "priority") focus.push(localize(library.competence.get(r.competenceId)!.title, lang).toLowerCase());
    if (r.kind === "practice") focus.push(skillName(r.skill));
  }
  const uniq = [...new Set(focus)];
  const focusLine = uniq.length >= 2 ? t("dash.focusBoth", { a: uniq[0], b: uniq[1] }) : uniq.length === 1 ? t("dash.focusOne", { a: uniq[0] }) : plan.steps.length ? t("dash.focusReview") : plan.routeComplete ? t("today.routeDone") : t("today.nothing");

  // B — plan blocks by phase.
  const phases: Phase[] = ["warmup", "learn", "practice", "reinforce", "apply"];
  const blocks = phases
    .map((ph) => ({ ph, steps: plan.steps.filter((s) => s.phase === ph) }))
    .filter((b) => b.steps.length);
  const minutes = Math.max(1, Math.round(plan.steps.reduce((m, s) => m + MIN_PER[s.phase ?? "practice"], 0)));
  const reinforce = plan.reasons.find((r): r is Extract<Reason, { kind: "reinforce" }> => r.kind === "reinforce");

  const daysSinceBackup = profile.lastBackupAt ? (data.now - Date.parse(profile.lastBackupAt)) / 86_400_000 : Infinity;
  const needsBackup = data.savedWords + data.dueItems >= 15 && daysSinceBackup > BACKUP_EVERY_DAYS;
  const allStops = route(library, profile);
  // Show the route around where the learner is; the full map is one tap away.
  const here = Math.max(0, allStops.findIndex((c) => c.id === current?.id));
  const stops = fullRoute ? allStops : allStops.slice(Math.max(0, here - 1), here + 5);

  return (
    <div className="page dash">
      <section className="dash-hero" aria-labelledby="dash-hello">
        <h1 id="dash-hello" className="dash-hello">{greet}</h1>
        <p className="dash-focus">{focusLine}</p>
        {plan.steps.length > 0 && (
          <Link className="btn btn-primary dash-cta" to="/session">{data.doneToday ? t("today.again") : xp.total === 0 ? t("today.start") : t("dash.continue")}</Link>
        )}
        {data.doneToday && <p className="setting-hint">{t("dash.planDone")}</p>}
      </section>

      {profile.track === "exam" && profile.cert && (
        <section className="card ex-today-card" aria-labelledby="dash-exam">
          <div className="card-head">
            <h2 id="dash-exam" className="section-title">{t("exam.preparingFor")} {EXAMS[profile.cert.exam].name}</h2>
            {profile.cert.date && <span className="card-meta">{profile.cert.date}</span>}
          </div>
          <p className="setting-hint">{t("dash.examHint")}</p>
          <Link className="btn btn-primary btn-small" to="/exam">{t("dash.examOpen")}</Link>
        </section>
      )}

      {profile.placementSource !== "diagnostic" && profile.placedBand !== "preA1" && (
        <div className="banner banner-info" role="note">
          <p>{t("today.diagnosticOffer")}</p>
          <Link className="btn btn-primary btn-small" to="/placement">{t("today.diagnosticAction")}</Link>
        </div>
      )}
      {needsBackup && (
        <div className="banner" role="note">
          <p>{t("today.backup")}</p>
          <Link className="btn btn-quiet btn-small" to="/settings#backup">{t("today.backupAction")}</Link>
        </div>
      )}

      <div className="dash-grid">
        <div className="dash-main">
          {blocks.length > 0 && (
            <section className="card" aria-labelledby="dash-plan" data-order="1">
              <div className="card-head">
                <h2 id="dash-plan" className="section-title">{t("dash.plan")}</h2>
                <span className="card-meta">{t("dash.planMinutes", { n: String(minutes) })}</span>
              </div>
              <ol className="plan-list">
                {blocks.map(({ ph, steps }) => (
                  <li key={ph} className="plan-item" data-done={data.doneToday}>
                    <span className="plan-dot" aria-hidden="true" />
                    <Link to={ph === "warmup" ? "/review/session" : "/session"} className="plan-link">
                      {ph === "warmup" && t("dash.step.warmup", { n: String(steps.length) })}
                      {ph === "learn" && t("dash.step.learn")}
                      {ph === "practice" && current && t("dash.step.practice", { n: String(steps.length), name: localize(current.title, lang) })}
                      {ph === "reinforce" && reinforce && t("dash.step.reinforce", { topic: topicName(reinforce.tag, lang) })}
                      {ph === "apply" && t("dash.step.apply")}
                    </Link>
                    {data.doneToday && <span className="pill pill-good">{t("dash.done")}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {current && cp && (
            <section className="card" aria-labelledby="dash-journey" data-order="5">
              <h2 id="dash-journey" className="section-title">{t("dash.journey")}</h2>
              <p className="journey-name">
                {localize(current.title, lang)} <span className="route-band">{label(current.band)}</span>
              </p>
              <p className="today-cando">{localize(current.canDo, lang)}</p>
              <p className="journey-skills">{current.skills.map((k) => t(`skill.${k}` as StringKey)).join(" · ")}</p>
              <div className="today-meter" aria-hidden="true"><div className="today-meter-fill" style={{ width: `${(cp.answered / Math.max(cp.total, 1)) * 100}%` }} /></div>
              <p className="today-stats journey-stats">
                <span>{t("today.progress", { done: String(cp.answered), total: String(cp.total) })}</span>
                <span>{t("dash.journeyNext", { n: String(cp.total - cp.answered) })}</span>
                <span>{t("dash.journeyMinutes", { n: String(Math.max(1, Math.round((cp.total - cp.answered) * 1.3))) })}</span>
              </p>
              {current.prerequisites.length > 0 && (
                <p className="setting-hint">
                  {t("dash.journeyPre", { names: current.prerequisites.map((id) => (library.competence.get(id) ? localize(library.competence.get(id)!.title, lang) : id)).join(", ") })}
                </p>
              )}
            </section>
          )}

          <section aria-labelledby="route-title" data-order="9" className="card route">
            <h2 id="route-title" className="section-title">{t("today.route")}</h2>
            <ol className="route-list">
              {stops.map((c) => {
                const p = progress.get(c.id)!;
                const state = p.mastered ? "mastered" : c.id === current?.id ? "current" : p.answered === p.total ? "practised" : p.unlocked ? "open" : "locked";
                const blocker = c.prerequisites.map((id) => library.competence.get(id)).find((pre) => pre && progress.get(pre.id) && progress.get(pre.id)!.answered < progress.get(pre.id)!.total && progress.get(pre.id)!.unlocked);
                return (
                  <li key={c.id} className="route-stop" data-state={state} aria-current={state === "current" ? "step" : undefined}>
                    <span className="route-node" aria-hidden="true" />
                    <div className="route-text">
                      <p className="route-name">{localize(c.title, lang)} <span className="route-band">{label(c.band)}</span></p>
                      <p className="route-detail">
                        {state === "mastered" ? t("today.mastered") : state === "locked" && blocker ? t("today.locked", { name: localize(blocker.title, lang) }) : t("today.progress", { done: String(p.answered), total: String(p.total) })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {allStops.length > stops.length || fullRoute ? (
              <button type="button" className="btn btn-quiet btn-small" aria-expanded={fullRoute} onClick={() => setFullRoute((v) => !v)}>
                {fullRoute ? t("dash.routeLess") : t("dash.routeAll", { n: String(allStops.length) })}
              </button>
            ) : null}
          </section>
        </div>

        <div className="dash-side">
          <section className="card" aria-labelledby="dash-rev" data-order="2">
            <h2 id="dash-rev" className="section-title">{t("dash.revision")}</h2>
            <dl className="stat-row">
              <div><dt>{t("dash.dueWords")}</dt><dd>{data.dueWords}</dd></div>
              <div><dt>{t("dash.dueItems")}</dt><dd>{data.dueItems}</dd></div>
              <div><dt>{t("dash.mistakes")}</dt><dd>{data.openMistakes}</dd></div>
            </dl>
            {model.weakTags.length > 0 && (
              <ul className="tag-list">
                {model.weakTags.slice(0, 3).map((w) => <li key={w.tag}><Link to="/library/mistakes">{topicName(w.tag, lang)}</Link> <span className="card-meta">{w.count}</span></li>)}
              </ul>
            )}
            {plan.deferredReviews > 0 && <p className="setting-hint">{t("today.deferred", { n: String(plan.deferredReviews) })}</p>}
            {data.openMistakes > 0 && <Link className="btn btn-quiet btn-small" to="/library/mistakes">{t("dash.fixMistakes")}</Link>}
            {data.dueWords + data.dueItems > 0 ? (
              <Link className="btn btn-quiet btn-small" to="/review/session">{t("dash.reviewNow")}</Link>
            ) : (
              <p className="setting-hint">{t("today.reviewsNone")}</p>
            )}
          </section>

          <section className="card" aria-labelledby="dash-xp" data-order="3">
            <div className="card-head">
              <h2 id="dash-xp" className="section-title">{t("dash.xp")}</h2>
              <span className="xp-level">{t("dash.level", { n: String(xp.level.level) })}</span>
            </div>
            <p className="xp-total">{xp.total} XP</p>
            <div className="today-meter" aria-hidden="true"><div className="today-meter-fill" style={{ width: `${(xp.level.into / xp.level.span) * 100}%` }} /></div>
            <p className="today-stats">
              <span>{t("dash.toNext", { n: String(xp.level.span - xp.level.into), next: String(xp.level.level + 1) })}</span>
              <span>{t("dash.xpToday")}: {xp.today}</span>
              <span>{t("dash.xpWeek")}: {xp.week}</span>
            </p>
            <p className="setting-hint">{t("dash.xpNote")}</p>
            <h3 className="mini-title">{t("dash.recent")}</h3>
            {data.achievements.length ? (
              <ul className="summary-badges">
                {[...data.achievements].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4).map((a) => <li key={a.id} className="badge">{t(`ach.${a.id}` as StringKey)}</li>)}
              </ul>
            ) : (
              <p className="setting-hint">{t("dash.noAch")}</p>
            )}
          </section>

          <section className="card" aria-labelledby="dash-skills" data-order="4">
            <h2 id="dash-skills" className="section-title">{t("dash.skills")}</h2>
            <p className="dash-band">
              {t("dash.level.chosen", { band: label(profile.acceptedBand ?? profile.placedBand ?? "A1") })}
            </p>
            <SkillList model={model} />
            <Link className="btn btn-quiet btn-small" to="/placement">{t("dash.retest")}</Link>
          </section>

          {data.insights.length > 0 && (
            <section className="card" aria-labelledby="dash-ins" data-order="6">
              <h2 id="dash-ins" className="section-title">{t("dash.insights")}</h2>
              <ul className="insights">{data.insights.map((i, k) => <li key={k}>{insightText(i, t, lang)}</li>)}</ul>
            </section>
          )}

          <section className="card" aria-labelledby="dash-week" data-order="7">
            <h2 id="dash-week" className="section-title">{t("dash.week")}</h2>
            <WeekChart weekly={data.weekly} lang={lang} />
            <p className="today-stats">
              <span>{t("dash.activeDays", { n: String(data.days.slice(-7).filter((d) => d.active).length) })}</span>
              {data.reviewAccuracy !== null && <span>{t("dash.weekAccuracy", { n: String(Math.round(data.reviewAccuracy * 100)) })}</span>}
            </p>
          </section>

          <section className="card" aria-labelledby="dash-lib" data-order="8">
            <h2 id="dash-lib" className="section-title">{t("dash.library")}</h2>
            <ul className="lib-links">
              <li><Link to="/library/words">{t("lib.words")}</Link> <span className="card-meta">{data.savedWords}</span></li>
              <li><Link to="/library/mistakes">{t("lib.mistakes")}</Link> <span className="card-meta">{data.openMistakes}</span></li>
              <li><Link to="/library/grammar">{t("lib.grammar")}</Link></li>
              <li><Link to="/library/expressions">{t("lib.expressions")}</Link></li>
              <li><Link to="/library/alphabet">{t("lib.alphabet")}</Link></li>
              <li><Link to="/library/reading">{t("lib.reading")}</Link></li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function SkillList({ model }: { model: Awaited<ReturnType<typeof dashboard>>["model"] }) {
  const { t } = useProfile();
  return (
    <ul className="skill-list">
      {SKILLS.map((k: Skill) => {
        const s = model.skills[k];
        return (
          <li key={k} className="skill-row">
            <span className="skill-name">{t(`skill.${k}` as StringKey)}</span>
            {s.accuracy !== null ? (
              <>
                <span className="res-skill-track" aria-hidden="true"><span className="res-skill-fill" style={{ width: `${Math.round(s.accuracy * 100)}%` }} /></span>
                <span className="skill-val">{t("dash.skillAccuracy", { n: String(Math.round(s.accuracy * 100)) })}</span>
              </>
            ) : (
              <span className="skill-val skill-none">{s.placed ? t("dash.skillPlaced", { band: label(s.placed) }) : t("dash.skillNone")}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Minutes per day for the last 7 days, drawn to scale (max of the week or 10 min). */
function WeekChart({ weekly, lang }: { weekly: { day: string; minutes: number }[]; lang: UiLanguage }) {
  const { t } = useProfile();
  const max = Math.max(10, ...weekly.map((d) => d.minutes));
  const W = 280, H = 110, base = 86, top = 14, bw = 26;
  const gap = (W - 7 * bw) / 6;
  const fmt = new Intl.DateTimeFormat(lang === "bg" ? "bg-BG" : "en-GB", { weekday: "narrow" });
  return (
    <svg className="week-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t("dash.weekMinutes")}: ${weekly.map((d) => d.minutes).join(", ")}`}>
      <line x1="0" x2={W} y1={base} y2={base} className="wc-axis" />
      <text x="0" y={top - 4} className="wc-label">{max} min</text>
      <line x1="0" x2={W} y1={top} y2={top} className="wc-grid" />
      {weekly.map((d, i) => {
        const h = ((base - top) * d.minutes) / max;
        const x = i * (bw + gap);
        const isToday = i === weekly.length - 1;
        return (
          <g key={d.day}>
            <rect x={x} y={base - Math.max(h, d.minutes > 0 ? 2 : 0)} width={bw} height={Math.max(h, d.minutes > 0 ? 2 : 0)} rx="4" className={isToday ? "wc-bar wc-today" : "wc-bar"} />
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="wc-label">{fmt.format(new Date(`${d.day}T12:00:00`))}</text>
          </g>
        );
      })}
    </svg>
  );
}

function insightText(i: Insight, t: ReturnType<typeof useProfile>["t"], lang: UiLanguage): string {
  switch (i.kind) {
    case "due": return t("ins.due", { n: String(i.n) });
    case "weak-topic": return t("ins.weak", { topic: topicName(i.tag, lang), n: String(i.count) });
    case "improved": return t("ins.improved", { skill: t(`skill.${i.skill}` as StringKey).toLowerCase(), a: String(Math.round(i.before * 100)), b: String(Math.round(i.after * 100)) });
    case "consistency": return t("ins.consistency", { n: String(i.days) });
    case "words": return t("ins.words", { n: String(i.n) });
  }
}
