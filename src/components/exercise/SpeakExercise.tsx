import { useEffect, useRef, useState } from "react";
import { localize, type Item } from "../../content/schema";
import type { Outcome } from "../../engine/progress";
import { checkKeywords, compareSpeech, type Comparison } from "../../engine/speaking";
import { speak, stopSpeaking, type Speed } from "../../lib/speech";
import { useProfile } from "../../state/profile";
import { Recorder, type Take } from "../speaking/Recorder";
import { LensText } from "../lens/Lens";
import type { StringKey } from "../../i18n/strings";

type Speak = Extract<Item, { type: "speak" }>;

export function SpeedToggle({ value, onChange }: { value: Speed; onChange: (s: Speed) => void }) {
  const { t } = useProfile();
  return (
    <span className="speed" role="group" aria-label={t("speak.speed")}>
      {(["normal", "slow"] as const).map((s) => (
        <button key={s} type="button" aria-pressed={value === s} onClick={() => onChange(s)}>{t(`speak.${s}` as StringKey)}</button>
      ))}
    </span>
  );
}

/**
 * Speaking practice. With recognition, we show which target words were recognised (not a pronunciation score).
 * Without it, the learner compares their recording with the model and rates themselves.
 */
export function SpeakExercise({ item, onDone }: { item: Speak; onDone: (outcome: Outcome, given: string) => void }) {
  const { t, lang, profile } = useProfile();
  const [speed, setSpeed] = useState<Speed>("normal");
  const [take, setTake] = useState<Take | null>(null);
  const [tries, setTries] = useState(0);
  const [manual, setManual] = useState(false);
  const [result, setResult] = useState<{ kind: "words"; c: Comparison } | { kind: "keywords"; found: boolean[] } | null>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const voice = { presents: item.voice?.presents, accent: item.voice?.accent ?? profile?.accent, voiceId: profile?.voiceId };
  const say = item.mode === "answer" ? item.prompt : item.target!;

  useEffect(() => () => stopSpeaking(), []);

  const play = (text: string) => speak(text, { ...voice, speed });

  const onTake = (tk: Take) => {
    setTake(tk);
    setTries((n) => n + 1);
    if (tk.transcript) {
      if (item.mode === "answer") setResult({ kind: "keywords", found: checkKeywords(item.keywords, tk.transcript).map((k) => k.found) });
      else setResult({ kind: "words", c: compareSpeech(item.target!, tk.transcript) });
    } else setResult(null);
  };

  const recognisedOk = result?.kind === "words" ? result.c.complete : result?.kind === "keywords" ? result.found.every(Boolean) : null;

  const finish = (selfOk: boolean | null) => {
    const ok = recognisedOk ?? selfOk ?? false;
    onDone(ok ? (tries <= 1 ? "first" : "hint") : "hint", take?.transcript ?? "(spoken)");
  };

  const heading = { repeat: "speak.repeat", read: "speak.read", answer: "speak.answer" }[item.mode] as StringKey;

  return (
    <div className="exercise" data-type="speak" data-item-id={item.id}>
      <p className="exercise-objective">{localize(item.objective, lang)}</p>
      <p className="step-label">{t(heading)}</p>

      {item.mode === "repeat" ? (
        <div className="rec-row">
          <button type="button" className="btn btn-primary" onClick={() => play(say)}>{t("speak.listen")}</button>
          <SpeedToggle value={speed} onChange={setSpeed} />
        </div>
      ) : (
        <p className="exercise-prompt" lang="en"><LensText text={item.prompt} /></p>
      )}
      {item.mode === "answer" && (
        <div className="rec-row">
          <button type="button" className="btn btn-quiet btn-small" onClick={() => play(item.prompt)}>{t("speak.listen")}</button>
          <SpeedToggle value={speed} onChange={setSpeed} />
        </div>
      )}
      {item.mode === "repeat" && take && <p className="exercise-prompt" lang="en">{item.target}</p>}

      {!manual && <Recorder onTake={onTake} onSkip={() => setManual(true)} />}

      {take && (
        <div className="takes">
          <div className="take">
            <span className="take-label">{t("mic.yours")}</span>
            <audio controls src={take.url} />
          </div>
          <div className="take">
            <span className="take-label">{t("mic.model")}</span>
            <button type="button" className="btn btn-quiet btn-small" onClick={() => play(item.mode === "answer" ? item.model : say)}>{t("speak.listen")}</button>
            <span lang="en">{item.mode === "answer" ? item.model : say}</span>
          </div>
        </div>
      )}

      <div className="exercise-feedback" role="status" aria-live="polite">
        {take && result?.kind === "words" && (
          <div className={`feedback ${result.c.complete ? "feedback-right" : "feedback-shown"}`}>
            <p className="feedback-title">{result.c.complete ? t("rec.allHeard") : t("rec.someMissing")}</p>
            <p className="words-check" lang="en">
              {result.c.target.map((w, k) => (
                <span key={k} className={`wc wc-${w.status}`} title={w.status === "heard" ? t("rec.heard") : t("rec.missing")}>{w.word}</span>
              ))}
            </p>
            <p className="setting-hint">{t("rec.heard")}: “{take.transcript}”</p>
            <p className="setting-hint">{t("rec.disclaimer")}</p>
          </div>
        )}
        {take && result?.kind === "keywords" && (
          <div className={`feedback ${recognisedOk ? "feedback-right" : "feedback-shown"}`}>
            <p className="feedback-title">{recognisedOk ? t("rec.keywordsAll") : t("rec.keywordsSome")}</p>
            <p className="setting-hint">{t("rec.heard")}: “{take.transcript}”</p>
            <p className="feedback-explanation">{localize(item.explanation, lang)}</p>
          </div>
        )}
        {take && !take.transcript && take.recognition && !take.recognition.ok && (
          <p className="rec-note">{take.recognition.error === "no-speech" ? t("rec.noSpeech") : t("rec.error")}</p>
        )}
      </div>

      {(take || manual) && (
        <div className="exercise-actions">
          {recognisedOk === null ? (
            <>
              <p className="step-label" style={{ width: "100%" }}>{t("self.title")}</p>
              {manual && (
                <button type="button" className="btn btn-quiet btn-small" onClick={() => play(item.mode === "answer" ? item.model : say)}>
                  {t("mic.model")}: {t("speak.listen")}
                </button>
              )}
              <button ref={continueRef} type="button" className="btn btn-primary" onClick={() => finish(true)}>{t("self.good")}</button>
              <button type="button" className="btn btn-quiet" onClick={() => finish(false)}>{t("self.practice")}</button>
            </>
          ) : (
            <button ref={continueRef} type="button" className="btn btn-primary" onClick={() => finish(null)}>{t("session.continue")}</button>
          )}
        </div>
      )}
    </div>
  );
}
