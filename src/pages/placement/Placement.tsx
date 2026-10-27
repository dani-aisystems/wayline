import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { diagBank } from "../../content/diagnosticBank";
import { localize, normalizeAnswer } from "../../content/schema";
import type { DiagItem, DiagSkill } from "../../content/diagnostic";
import { db } from "../../db/db";
import { nextItem, result, SELF_RATING_PRIOR, type Mode, type PlacementState } from "../../engine/placement";
import { loadVoices, speakDialogue } from "../../lib/speech";
import { useProfile } from "../../state/profile";
import { award, XP } from "../../engine/xp";
import { Wordmark } from "../../components/Logo";
import type { StringKey } from "../../i18n/strings";
import "./placement.css";

const MAX_PLAYS = 2;

export function Placement() {
  const { t, lang, profile, update, status } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const saving = useRef(false);
  const [state, setState] = useState<PlacementState | null>(null);
  const [hasVoice, setHasVoice] = useState<boolean | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    void loadVoices().then((v) => setHasVoice(v.length > 0));
  }, []);

  const item = useMemo(() => (state ? nextItem(diagBank, state) : null), [state]);

  useEffect(() => headingRef.current?.focus(), [state?.responses.length, state === null]);

  // Finish: store the result as a new placement row (history is kept), clear the draft, show results.
  useEffect(() => {
    if (!state || item || saving.current) return;
    saving.current = true;
    const res = result(diagBank, state);
    void (async () => {
      const id = await db.placements.add({ at: new Date().toISOString(), mode: state.mode, responses: state.responses, result: res });
      await update({ placementDraft: undefined });
      await award(`placement:${id}`, XP.placement, "placement");
      navigate(`/placement/result/${id}`, { replace: true });
    })();
  }, [state, item, update, navigate]);

  if (status === "loading" || !profile || hasVoice === null) return <div className="pl" aria-busy="true" />;
  if (!diagBank.size) return <div className="pl"><p>{t("test.unavailable")}</p></div>;

  const begin = (mode: Mode, resume: boolean) => {
    const draft = profile.placementDraft;
    const s: PlacementState =
      resume && draft
        ? { mode: draft.mode, priorMean: draft.priorMean, responses: draft.responses, skipSkills: draft.skipSkills as DiagSkill[] }
        : { mode, priorMean: SELF_RATING_PRIOR[profile.selfRating ?? "unsure"] ?? -0.8, responses: [], skipSkills: hasVoice ? [] : ["listening"] };
    setState(s);
  };

  const answer = async (correct: boolean) => {
    if (!state || !item) return;
    const next = { ...state, responses: [...state.responses, { itemId: item.id, correct }] };
    await update({ placementDraft: { ...next, startedAt: profile.placementDraft?.startedAt ?? new Date().toISOString() } });
    // Do not advance the visible question until its answer is durable. A fast
    // reload after the UI changed could otherwise resume one question behind.
    setState(next);
  };

  if (!state) {
    const extended = new URLSearchParams(location.search).get("mode") === "extended";
    return (
      <div className="pl">
        <header className="pl-bar"><Wordmark height={26} /></header>
        <main className="pl-intro">
          <h1 tabIndex={-1} ref={headingRef}>{t("test.title")}</h1>
          <p className="pl-lead">{t("test.lead")}</p>
          <ul className="pl-points">
            <li>{t("test.points.time")}</li>
            <li>{t("test.points.skills")}</li>
            <li>{t("test.points.unknown")}</li>
            <li>{t("test.points.estimate")}</li>
          </ul>
          {!hasVoice && <p className="onb-note">{t("test.noVoice")}</p>}
          <div className="onb-actions">
            {profile.placementDraft ? (
              <>
                <button type="button" className="btn btn-primary" onClick={() => begin(profile.placementDraft!.mode, true)}>{t("test.resume")}</button>
                <button type="button" className="btn btn-quiet" onClick={() => begin("quick", false)}>{t("test.restart")}</button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => begin(extended ? "extended" : "quick", false)}>{t("test.start")}</button>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (!item) return <div className="pl" aria-busy="true" />;

  const n = state.responses.length + 1;
  return (
    <div className="pl">
      <header className="pl-bar">
        <p className="pl-count">{t("test.question", { n: String(n) })}</p>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => navigate(profile.onboardedAt ? "/today" : "/placement")}>
          {t("test.leave")}
        </button>
      </header>
      <div className="session-progress" aria-hidden="true">
        <div className="session-progress-fill" style={{ width: `${Math.min(100, (state.responses.length / 30) * 100)}%` }} />
      </div>
      <main className="pl-main">
        <h1 className="visually-hidden" tabIndex={-1} ref={headingRef}>{t("test.question", { n: String(n) })}</h1>
        <p className="pl-skill">{t(`test.skill.${item.skill}` as StringKey)}</p>
        <Question key={item.id} item={item} lang={lang} voiceId={profile.voiceId} onAnswer={answer} />
      </main>
    </div>
  );
}

function Question({ item, lang, voiceId, onAnswer }: { item: DiagItem; lang: "en" | "bg"; voiceId?: string; onAnswer: (correct: boolean) => void }) {
  const { t } = useProfile();
  const [choice, setChoice] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [plays, setPlays] = useState(0);
  const inputId = useId();
  const listening = item.skill === "listening";
  const ready = item.type === "choice" ? choice !== null : typed.trim().length > 0;

  const submit = () => {
    if (!ready) return;
    const correct =
      item.type === "choice" ? choice === item.correct : item.accept.some((a) => normalizeAnswer(a) === normalizeAnswer(typed));
    onAnswer(correct);
  };

  const play = async () => {
    if (plays >= MAX_PLAYS || !item.passage) return;
    setPlays((p) => p + 1);
    await speakDialogue(item.passage, { voiceId });
  };

  return (
    <form className="pl-q" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className="visually-hidden">{localize(item.objective, lang)}</p>
      {listening ? (
        <div className="pl-listen">
          <p className="step-label">{t("test.listenFirst")}</p>
          <button type="button" className="btn btn-primary" onClick={play} disabled={plays >= MAX_PLAYS}>
            {plays === 0 ? t("test.play") : t("test.playAgain", { n: String(MAX_PLAYS - plays) })}
          </button>
        </div>
      ) : (
        item.passage && <blockquote className="pl-passage" lang="en">{item.passage.split("\n").map((l, i) => <p key={i}>{l}</p>)}</blockquote>
      )}

      {item.type === "choice" ? (
        <fieldset className="exercise-body">
          <legend className="exercise-prompt pl-prompt" lang="en">{item.prompt}</legend>
          <div className="choice-list">
            {item.options.map((o, i) => (
              <label key={i} className="choice" data-selected={choice === i}>
                <input type="radio" name="pl-choice" checked={choice === i} onChange={() => setChoice(i)} />
                <span lang="en">{o}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <div className="exercise-body">
          <label htmlFor={inputId} className="visually-hidden">{t("session.typeHere")}</label>
          <p className="exercise-prompt pl-prompt cloze-sentence" lang="en">
            {item.sentence.split("___")[0]}
            <input id={inputId} className="cloze-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} size={10} />
            {item.sentence.split("___")[1]}
          </p>
        </div>
      )}

      <div className="exercise-actions">
        <button type="submit" className="btn btn-primary" disabled={!ready}>{t("test.next")}</button>
        <button type="button" className="btn btn-quiet" onClick={() => onAnswer(false)}>{t("test.dontKnow")}</button>
      </div>
    </form>
  );
}
