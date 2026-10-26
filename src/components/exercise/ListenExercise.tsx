import { useEffect, useState } from "react";
import { localize, type Item } from "../../content/schema";
import type { Outcome } from "../../engine/progress";
import { parseDialogue, speakDialogue, stopSpeaking, type Speed, type VoiceWish } from "../../lib/speech";
import { useProfile } from "../../state/profile";
import { SpeedToggle } from "./SpeakExercise";

type Listen = Extract<Item, { type: "listen" }>;

/** Listening comprehension: play as often as needed, answer, then read the transcript. */
export function ListenExercise({ item, onDone }: { item: Listen; onDone: (outcome: Outcome, given: string) => void }) {
  const { t, lang, profile } = useProfile();
  const [speed, setSpeed] = useState<Speed>("normal");
  const [choice, setChoice] = useState<number | null>(null);
  const [wrong, setWrong] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const names = Object.fromEntries(item.characters.map((c) => [c.id, c]));
  const wishes: Record<string, VoiceWish> = Object.fromEntries(item.characters.map((c) => [c.name, { presents: c.presents, accent: c.accent }]));
  const lines = parseDialogue(item.audio);

  useEffect(() => () => stopSpeaking(), []);

  const play = async () => {
    await speakDialogue(item.audio, { speed, voiceId: lines.length === 1 ? profile?.voiceId : undefined, wishes, onLine: setNow });
    setNow(null);
  };

  const check = () => {
    if (choice === null) return;
    if (choice === item.correct) setDone(true);
    else {
      setWrong((w) => [...w, choice]);
      setChoice(null);
      if (wrong.length >= 1) setDone(true);
    }
  };
  const outcome: Outcome = wrong.length === 0 ? "first" : choice === item.correct ? "hint" : "revealed";

  return (
    <div className="exercise" data-type="listen" data-item-id={item.id}>
      <p className="exercise-objective">{localize(item.objective, lang)}</p>
      <p className="step-label">{t("listen.question")}</p>
      <div className="rec-row">
        <button type="button" className="btn btn-primary" onClick={play}>{t("speak.listen")}</button>
        <SpeedToggle value={speed} onChange={setSpeed} />
      </div>

      <fieldset className="exercise-body" disabled={done}>
        <legend className="exercise-prompt pl-prompt" lang="en">{item.question}</legend>
        <div className="choice-list">
          {item.options.map((o, i) => (
            <label key={i} className="choice" data-selected={choice === i} data-out={wrong.includes(i)} data-right={done && i === item.correct}>
              <input type="radio" name={`l-${item.id}`} checked={choice === i} disabled={wrong.includes(i) || done} onChange={() => setChoice(i)} />
              <span lang="en">{o}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="exercise-feedback" role="status" aria-live="polite">
        {!done && wrong.length > 0 && (
          <div className="feedback feedback-wrong"><p className="feedback-title">{t("session.tryAgain")}</p></div>
        )}
        {done && (
          <div className={`feedback ${outcome !== "revealed" ? "feedback-right" : "feedback-shown"}`}>
            <p className="feedback-title">{outcome !== "revealed" ? t("session.correct") : <>{t("session.answerWas")} <strong lang="en">{item.options[item.correct]}</strong></>}</p>
            <p className="feedback-explanation">{localize(item.explanation, lang)}</p>
            <p className="step-label">{t("listen.transcript")}</p>
            <div className="transcript" lang="en">
              {lines.map((l, i) => (
                <p key={i} data-speaking={now === i}>
                  {l.speaker && <strong>{names[l.speaker.toLowerCase()]?.name ?? l.speaker}: </strong>}
                  {l.text}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="exercise-actions">
        {done ? (
          <button type="button" className="btn btn-primary" onClick={() => onDone(outcome, choice !== null ? item.options[choice] : "")}>{t("session.continue")}</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={check} disabled={choice === null}>{t("session.check")}</button>
        )}
      </div>
    </div>
  );
}
