import { useEffect, useId, useMemo, useRef, useState } from "react";
import { localize, type Item } from "../../content/schema";
import { checkAnswer, modelAnswer, seededShuffle, type Answer } from "../../engine/check";
import type { Outcome } from "../../engine/progress";
import { speak } from "../../lib/speech";
import { useProfile } from "../../state/profile";
import { library } from "../../content/library";
import { LensText } from "../lens/Lens";
import "./exercise.css";

type Phase = "answering" | "wrong" | "done";

/**
 * One exercise. Feedback follows prompt-before-reveal: a wrong answer gets the next hint and
 * another try; the answer is shown only when hints run out or the learner asks for it.
 */
export function Exercise({ item, onDone }: { item: Item; onDone: (outcome: Outcome, given: string) => void }) {
  const { t, lang, profile } = useProfile();
  const [phase, setPhase] = useState<Phase>("answering");
  const [hintsShown, setHintsShown] = useState(0);
  const [wrongTries, setWrongTries] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [firstGiven, setFirstGiven] = useState("");
  const [value, setValue] = useState("");
  const [choice, setChoice] = useState<number | null>(null);
  const [eliminated, setEliminated] = useState<number[]>([]);
  const [tiles, setTiles] = useState<number[]>([]);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const text = item.textId ? library.text.get(item.textId) : undefined;

  const shuffledTiles = useMemo(
    () => (item.type === "build" ? seededShuffle(item.tiles.map((_, i) => i), item.id) : []),
    [item],
  );

  useEffect(() => {
    if (phase === "done") continueRef.current?.focus();
  }, [phase]);

  const answer = (): Answer | null => {
    if (item.type === "choice") return choice === null ? null : { kind: "choice", index: choice };
    if (item.type === "cloze") return value.trim() ? { kind: "text", value } : null;
    return tiles.length ? { kind: "tiles", tiles: tiles.map((i) => item.tiles[i]) } : null;
  };
  const givenText = (a: Answer) => (a.kind === "text" ? a.value : a.kind === "choice" && item.type === "choice" ? item.options[a.index] : a.kind === "tiles" ? a.tiles.join(" ") : "");

  const finish = (o: Outcome) => {
    setOutcome(o);
    setPhase("done");
  };

  const check = () => {
    const a = answer();
    if (!a) return;
    if (!firstGiven) setFirstGiven(givenText(a));
    if (checkAnswer(item, a)) {
      finish(wrongTries === 0 && hintsShown === 0 ? "first" : "hint");
      return;
    }
    setWrongTries((n) => n + 1);
    if (item.type === "choice" && choice !== null) {
      setEliminated((e) => [...e, choice]);
      setChoice(null);
    }
    if (hintsShown < item.hints.length) {
      setHintsShown((n) => n + 1);
      setPhase("wrong");
    } else if (wrongTries >= 1) {
      finish("revealed");
    } else {
      setPhase("wrong");
    }
    requestAnimationFrame(() => feedbackRef.current?.focus());
  };

  const done = phase === "done";
  const solved = outcome === "first" || outcome === "hint";

  return (
    <div className="exercise" data-type={item.type} data-item-id={item.id}>
      <p className="exercise-objective">{localize(item.objective, lang)}</p>

      {text && (
        <p className="exercise-about">
          <span className="visually-hidden">Text: </span>
          {text.title}
        </p>
      )}

      {item.type === "choice" && (
        <fieldset className="exercise-body" disabled={done}>
          <legend className="exercise-prompt"><LensText text={item.prompt} /></legend>
          <div className="choice-list">
            {item.options.map((opt, i) => {
              const isOut = eliminated.includes(i);
              const isRight = done && i === item.correct;
              return (
                <label key={i} className="choice" data-selected={choice === i} data-out={isOut} data-right={isRight}>
                  <input type="radio" name={`c-${item.id}`} checked={choice === i} disabled={isOut || done} onChange={() => setChoice(i)} />
                  <span lang="en">{opt}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {item.type === "cloze" && (
        <div className="exercise-body">
          <label htmlFor={inputId} className="visually-hidden">{t("session.typeHere")}</label>
          <p className="exercise-prompt cloze-sentence" lang="en">
            <LensText text={item.sentence.split("___")[0]} context={item.sentence.replace("___", "…")} />
            <input
              id={inputId}
              className="cloze-input"
              value={done && !solved ? item.accept[0] : value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !done && check()}
              readOnly={done}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              size={Math.max(4, ...item.accept.map((a) => a.length + 1))}
              data-state={done ? (solved ? "right" : "shown") : phase === "wrong" ? "wrong" : undefined}
            />
            <LensText text={item.sentence.split("___")[1]} context={item.sentence.replace("___", "…")} />
          </p>
        </div>
      )}

      {item.type === "build" && (
        <div className="exercise-body">
          <p className="exercise-prompt-hint">{t("session.tapTiles")}</p>
          <div className="build-line" aria-live="polite" lang="en">
            {(done && !solved ? item.accept[0].split(" ") : tiles.map((i) => item.tiles[i])).map((w, k) => (
              <button
                key={`${w}-${k}`}
                type="button"
                className="tile tile-placed"
                disabled={done}
                onClick={() => setTiles((ts) => ts.filter((_, j) => j !== k))}
              >
                {w}
              </button>
            ))}
            {!tiles.length && !done && <span className="build-placeholder" aria-hidden="true">…</span>}
          </div>
          <div className="build-bank" lang="en">
            {shuffledTiles.map((i) => (
              <button key={i} type="button" className="tile" disabled={done || tiles.includes(i)} onClick={() => setTiles((ts) => [...ts, i])}>
                {item.tiles[i]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="exercise-feedback" ref={feedbackRef} tabIndex={-1} role="status" aria-live="polite">
        {!done && (phase === "wrong" || hintsShown > 0) && (
          <div className={`feedback ${phase === "wrong" ? "feedback-wrong" : "feedback-hint-only"}`}>
            {phase === "wrong" && <p className="feedback-title">{t("session.tryAgain")}</p>}
            {item.hints.slice(0, hintsShown).map((h, i) => (
              <p key={i} className="feedback-hint">{localize(h, lang)}</p>
            ))}
          </div>
        )}
        {done && (
          <div className={`feedback ${solved ? "feedback-right" : "feedback-shown"}`}>
            <p className="feedback-title">
              {solved ? t("session.correct") : t("session.answerWas")}
              {!solved && <> <strong lang="en">{modelAnswer(item)}</strong></>}
            </p>
            <p className="feedback-explanation">{localize(item.explanation, lang)}</p>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => speak(modelAnswer(item), { voiceId: profile?.voiceId })}>
              {t("session.listen")}
            </button>
          </div>
        )}
      </div>

      <div className="exercise-actions">
        {done ? (
          <button ref={continueRef} type="button" className="btn btn-primary" onClick={() => onDone(outcome!, firstGiven || modelAnswer(item))}>
            {t("session.continue")}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={check} disabled={!answer()}>
              {t("session.check")}
            </button>
            {item.type === "build" && tiles.length > 0 && (
              <button type="button" className="btn btn-quiet" onClick={() => setTiles([])}>{t("session.clear")}</button>
            )}
            {hintsShown < item.hints.length && (
              <button type="button" className="btn btn-quiet" onClick={() => setHintsShown((n) => n + 1)}>
                {t("session.hint")}
              </button>
            )}
            {(phase === "wrong" || hintsShown > 0) && (
              <button type="button" className="btn btn-quiet" onClick={() => { setFirstGiven((g) => g || "(shown)"); finish("revealed"); }}>
                {t("session.showAnswer")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
