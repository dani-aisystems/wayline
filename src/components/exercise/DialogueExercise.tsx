import { useEffect, useRef, useState } from "react";
import { localize, type Character, type Item } from "../../content/schema";
import type { Outcome } from "../../engine/progress";
import { speak, stopSpeaking, type Speed } from "../../lib/speech";
import { castNatural } from "../../lib/clips";
import { useProfile } from "../../state/profile";
import { Recorder } from "../speaking/Recorder";
import { SpeedToggle } from "./SpeakExercise";

type Dialogue = Extract<Item, { type: "dialogue" }>;

export function Avatar({ c, you = false }: { c?: Character; you?: boolean }) {
  const initial = you ? "•" : (c?.name[0] ?? "?");
  return <span className={`avatar ${you ? "avatar-you" : `tone-${c?.tone ?? 1}`}`} aria-hidden="true">{initial}</span>;
}

/**
 * Conversation with distinct character voices. The learner plays one character: at each of their turns they
 * choose what to say (wrong choices explain why), and can say it aloud. Lines play in each character's voice.
 */
export function DialogueExercise({ item, onDone }: { item: Dialogue; onDone: (outcome: Outcome, given: string) => void }) {
  const { t, lang, profile } = useProfile();
  const [shown, setShown] = useState(0); // lines revealed so far
  const [wrong, setWrong] = useState<Record<number, number[]>>({});
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [sayIt, setSayIt] = useState(false);
  const cast = Object.fromEntries(item.characters.map((c) => [c.id, c]));
  const me = cast[item.learnerAs];
  const endRef = useRef<HTMLDivElement>(null);

  // Each character keeps one natural voice for the whole scene (same casting as the build script).
  const naturalCast = castNatural(item.characters.map((c) => ({ key: c.id, presents: c.presents, accent: c.accent })));
  const deviceChoice = profile?.voiceId?.startsWith("device:");
  const voiceFor = (c?: Character) => ({ presents: c?.presents, accent: c?.accent ?? profile?.accent, natural: c && !deviceChoice ? naturalCast.get(c.id) : undefined });

  const play = async (i: number) => {
    const line = item.lines[i];
    if (!("by" in line)) return;
    setSpeaking(i);
    await speak(line.text, { ...voiceFor(cast[line.by]), speed });
    setSpeaking((s) => (s === i ? null : s));
  };

  // Reveal NPC lines one by one, speaking each, until the learner's next turn.
  useEffect(() => {
    if (shown >= item.lines.length) return;
    const line = item.lines[shown];
    if ("learner" in line) return;
    let cancelled = false;
    void (async () => {
      await play(shown);
      if (!cancelled) setShown((n) => n + 1);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), [shown]);

  const finished = shown >= item.lines.length;
  const anyWrong = Object.values(wrong).some((w) => w.length > 0);
  const turn = !finished && "learner" in item.lines[shown] ? (item.lines[shown] as Extract<Dialogue["lines"][number], { learner: true }>) : null;
  const lastWrong = turn ? wrong[shown]?.at(-1) : undefined;

  const choose = (k: number) => {
    if (!turn) return;
    if (turn.options[k].correct) {
      setSayIt(false);
      void speak(turn.options[k].text, { ...voiceFor(me), speed });
      setShown((n) => n + 1);
    } else {
      setWrong((w) => ({ ...w, [shown]: [...(w[shown] ?? []), k] }));
    }
  };

  return (
    <div className="exercise" data-type="dialogue" data-item-id={item.id}>
      <p className="exercise-objective">{localize(item.objective, lang)}</p>
      <p className="dlg-scene">{localize(item.scene, lang)}</p>
      <div className="dlg-cast">
        {item.characters.map((c) => (
          <span key={c.id} className="dlg-who"><Avatar c={c} you={c.id === item.learnerAs} /> {c.id === item.learnerAs ? `${c.name} (${t("dlg.you")})` : c.name}</span>
        ))}
        <SpeedToggle value={speed} onChange={setSpeed} />
      </div>

      <ol className="dlg-lines" aria-live="polite">
        {item.lines.slice(0, shown).map((line, i) => {
          if ("by" in line) {
            const c = cast[line.by];
            const you = line.by === item.learnerAs;
            return (
              <li key={i} className="dlg-line" data-you={you} data-speaking={speaking === i}>
                <Avatar c={c} you={you} />
                <div className="dlg-bubble" lang="en">
                  <span className="dlg-name">{c?.name}</span>
                  {line.text}
                  <div className="dlg-replay"><button type="button" className="btn btn-quiet btn-small" onClick={() => play(i)}>{t("dlg.replay")}</button></div>
                </div>
              </li>
            );
          }
          const picked = line.options.find((o) => o.correct)!;
          return (
            <li key={i} className="dlg-line" data-you="true">
              <Avatar you />
              <div className="dlg-bubble" lang="en"><span className="dlg-name">{me?.name} ({t("dlg.you")})</span>{picked.text}</div>
            </li>
          );
        })}
      </ol>

      {turn && (
        <div className="dlg-turn">
          <p className="step-label">{t("dlg.yourTurn")}</p>
          {turn.options.map((o, k) => (
            <button key={k} type="button" className="btn btn-quiet dlg-option" lang="en" data-wrong={wrong[shown]?.includes(k)} disabled={wrong[shown]?.includes(k)} onClick={() => choose(k)}>
              {o.text}
            </button>
          ))}
          {lastWrong !== undefined && (
            <div className="feedback feedback-wrong" role="status">
              <p className="feedback-title">{t("dlg.notQuite")}</p>
              {turn.options[lastWrong].why && <p>{localize(turn.options[lastWrong].why!, lang)}</p>}
            </div>
          )}
          {!sayIt ? (
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setSayIt(true)} style={{ justifySelf: "start" }}>{t("dlg.sayIt")}</button>
          ) : (
            <Recorder compact onTake={() => {}} onSkip={() => setSayIt(false)} />
          )}
        </div>
      )}
      <div ref={endRef} />

      {finished && (
        <div className="exercise-feedback">
          <div className={`feedback ${anyWrong ? "feedback-shown" : "feedback-right"}`}>
            <p className="feedback-title">{anyWrong ? t("session.answerWas") : t("session.correct")}</p>
            <p className="feedback-explanation">{localize(item.explanation, lang)}</p>
          </div>
          <div className="exercise-actions" style={{ marginTop: "var(--s-4)" }}>
            <button type="button" className="btn btn-primary" onClick={() => onDone(anyWrong ? "hint" : "first", "(dialogue)")}>{t("session.continue")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
