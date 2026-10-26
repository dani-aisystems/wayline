import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { library } from "../../content/library";
import { localize } from "../../content/schema";
import { gradeWord, planSession, recordItem, type Outcome, type SessionPlan, type Step } from "../../engine/progress";
import { db, requestPersistence } from "../../db/db";
import { award, awardForItem, checkAchievements, XP, type AchievementId } from "../../engine/xp";
import { localDay } from "../../engine/progress";
import type { StringKey } from "../../i18n/strings";
import { useProfile } from "../../state/profile";
import { Exercise } from "../../components/exercise/Exercise";
import { NoteStep, TextStep, WordReviewStep } from "./Steps";
import "./session.css";

type Tally = { first: number; helped: number; reviews: number };

export function Session({ reviewOnly = false }: { reviewOnly?: boolean }) {
  const { t, lang, profile, update } = useProfile();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState<Tally>({ first: 0, helped: 0, reviews: 0 });
  const [next, setNext] = useState<string | null>(null);
  const [xp, setXp] = useState(0);
  const [earned, setEarned] = useState<AchievementId[]>([]);
  const started = useRef(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Plan once per session so finishing items doesn't reshuffle the queue mid-way.
  useEffect(() => {
    if (!profile || plan) return;
    void planSession(profile, undefined, undefined, new Date(), { reviewOnly }).then(setPlan);
  }, [profile, plan, reviewOnly]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  if (!profile || !plan) return <div className="session session-loading" aria-busy="true" />;

  const steps = plan.steps;
  const finished = index >= steps.length;

  const advance = async () => {
    const nextIndex = index + 1;
    setIndex(nextIndex);
    if (nextIndex >= steps.length) {
      void requestPersistence(); // the learner has engaged: now it's fair to ask.
      const day = localDay();
      // The session key is the plan's own content, so reloading and finishing the same plan can't pay twice.
      const key = steps.map((s) => ("item" in s ? s.item.id : s.kind === "note" ? s.noteId : s.kind === "text" ? s.textId : "card" in s ? s.card.id : "")).join(",");
      let bonus = 0;
      if (steps.some((s) => s.phase === "practice" || s.phase === "apply")) {
        if (await award(`session:${day}:${hashKey(key)}`, XP.session, "lesson")) bonus += XP.session;
        if (!reviewOnly && (await award(`plan:${day}`, XP.plan, "plan"))) bonus += XP.plan;
      }
      if (bonus) setXp((x) => x + bonus);
      setEarned(await checkAchievements());
      if (!reviewOnly) {
        const p = await planSession(profile);
        setNext(p.competenceId);
      }
    }
  };

  const seconds = () => {
    const s = (Date.now() - started.current) / 1000;
    started.current = Date.now();
    return Math.min(s, 300);
  };

  const onItem = async (step: Extract<Step, { kind: "item" | "review-item" }>, outcome: Outcome, given: string) => {
    const isNew = !(await db.cards.get(`item:${step.item.id}`));
    await recordItem(step.item, outcome, given, { seconds: seconds() });
    const gained = await awardForItem(step.item, isNew);
    if (gained) setXp((x) => x + gained);
    setTally((x) => ({
      first: x.first + (step.kind === "item" && outcome === "first" ? 1 : 0),
      helped: x.helped + (outcome !== "first" ? 1 : 0),
      reviews: x.reviews + (step.kind === "review-item" ? 1 : 0),
    }));
    await advance();
  };

  if (!steps.length) {
    return (
      <div className="session session-empty">
        <p>{t("session.empty")}</p>
        <Link className="btn btn-primary" to="/today">{t("session.backHome")}</Link>
      </div>
    );
  }

  const step = steps[Math.min(index, steps.length - 1)];
  const stepKey = finished ? "done" : `${index}-${step.kind}`;

  return (
    <div className="session">
      <header className="session-bar">
        <button type="button" className="btn btn-quiet btn-small" onClick={() => navigate("/today")}>{t("session.close")}</button>
        <div
          className="session-progress"
          role="progressbar"
          aria-label={t("session.progress", { n: String(Math.min(index + 1, steps.length)), total: String(steps.length) })}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={index}
        >
          <div className="session-progress-fill" style={{ width: `${(index / steps.length) * 100}%` }} />
        </div>
      </header>

      <main className="session-main" key={stepKey}>
        <h1 className="visually-hidden" tabIndex={-1} ref={headingRef}>
          {finished ? t("session.summaryTitle") : t("session.progress", { n: String(index + 1), total: String(steps.length) })}
        </h1>
        {finished ? (
          <div className="step step-summary">
            <h2 className="step-title">{t("session.summaryTitle")}</h2>
            {xp > 0 && <p className="summary-xp" aria-live="polite">{t("session.xp", { n: String(xp) })}</p>}
            {earned.length > 0 && (
              <ul className="summary-badges">
                {earned.map((a) => <li key={a} className="badge">{t(`ach.${a}` as StringKey)}</li>)}
              </ul>
            )}
            <ul className="summary-list">
              {tally.first > 0 && <li>{t("session.summaryCorrect", { n: String(tally.first) })}</li>}
              {tally.helped > 0 && <li>{t("session.summaryHelp", { n: String(tally.helped) })}</li>}
              {tally.reviews > 0 && <li>{t("session.summaryReviews", { n: String(tally.reviews) })}</li>}
              {next && library.competence.get(next) && (
                <li>{t("session.summaryNext", { name: localize(library.competence.get(next)!.title, lang) })}</li>
              )}
            </ul>
            <Link className="btn btn-primary" to="/today">{t("session.backHome")}</Link>
          </div>
        ) : step.kind === "note" ? (
          <NoteStep
            noteId={step.noteId}
            onDone={async () => {
              await update({ seenNotes: [...new Set([...profile.seenNotes, step.noteId])] });
              await advance();
            }}
          />
        ) : step.kind === "text" ? (
          <TextStep textId={step.textId} onDone={advance} />
        ) : step.kind === "review-word" ? (
          <WordReviewStep
            entry={step.entry}
            card={step.card}
            onGrade={async (g) => {
              await gradeWord(step.card, g);
              if (await award(`wordreview:${step.card.id}:${localDay()}`, XP.review, "review")) setXp((x) => x + XP.review);
              setTally((x) => ({ ...x, reviews: x.reviews + 1 }));
              await advance();
            }}
          />
        ) : (
          <div className="step">
            {step.kind === "review-item" && <p className="step-label">{t("session.reviewLabel")}</p>}
            <Exercise item={step.item} onDone={(o, g) => onItem(step, o, g)} />
          </div>
        )}
      </main>
    </div>
  );
}

function hashKey(s: string): string {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
