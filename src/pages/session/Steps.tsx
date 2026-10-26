import { useState } from "react";
import { library } from "../../content/library";
import { localize, type GlossaryEntry } from "../../content/schema";
import type { StudyCard } from "../../db/db";
import { Rating, type Grade } from "../../lib/srs";
import { speak } from "../../lib/speech";
import { useProfile } from "../../state/profile";
import { LensText } from "../../components/lens/Lens";

export function NoteStep({ noteId, onDone }: { noteId: string; onDone: () => void }) {
  const { t, lang, profile } = useProfile();
  const note = library.note.get(noteId);
  if (!note) return null;
  return (
    <div className="step step-note">
      <p className="step-label">{t("session.noteLabel")}</p>
      <h2 className="step-title">{localize(note.title, lang)}</h2>
      <p className="step-body">{localize(note.body, lang)}</p>
      <ul className="note-examples">
        {note.examples.map((ex) => (
          <li key={ex}>
            <LensText text={ex} />
            <button type="button" className="btn btn-quiet btn-small" onClick={() => speak(ex, { voiceId: profile?.voiceId })} aria-label={`${t("session.listen")}: ${ex}`}>
              {t("session.listen")}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" onClick={onDone}>{t("session.continue")}</button>
    </div>
  );
}

export function TextStep({ textId, onDone }: { textId: string; onDone: () => void }) {
  const { t, profile } = useProfile();
  const text = library.text.get(textId);
  if (!text) return null;
  return (
    <div className="step step-text">
      <p className="step-label">{t("session.readText")}</p>
      <article className="reader" lang="en">
        <h2 className="reader-title">{text.title}</h2>
        {text.paragraphs.map((p, i) => (
          <p key={i}><LensText text={p} /></p>
        ))}
      </article>
      <div className="exercise-actions">
        <button type="button" className="btn btn-quiet" onClick={() => speak(text.paragraphs.join(" "), { voiceId: profile?.voiceId })}>
          {t("session.listen")}
        </button>
        <button type="button" className="btn btn-primary" onClick={onDone}>{t("session.continue")}</button>
      </div>
    </div>
  );
}

export function WordReviewStep({ entry, card, onGrade }: { entry: GlossaryEntry; card: StudyCard; onGrade: (g: Grade) => void }) {
  const { t, lang, profile } = useProfile();
  const [shown, setShown] = useState(false);
  return (
    <div className="step step-word">
      <p className="step-label">{t("session.wordPrompt")}</p>
      <h2 className="word-big" lang="en">{entry.word}</h2>
      {entry.ipa && <p className="word-ipa">{entry.ipa}</p>}
      {card.context && <p className="word-context" lang="en"><LensText text={card.context} /></p>}
      <button type="button" className="btn btn-quiet btn-small" onClick={() => speak(entry.word, { voiceId: profile?.voiceId })}>{t("session.listen")}</button>
      {shown ? (
        <>
          <p className="word-meaning">{localize(entry.meaning, lang)}</p>
          <p className="word-example" lang="en">{entry.example}</p>
          <div className="grade-row" role="group" aria-label={t("session.wordPrompt")}>
            <button type="button" className="btn btn-quiet grade grade-again" onClick={() => onGrade(Rating.Again)}>{t("session.again")}</button>
            <button type="button" className="btn btn-quiet grade" onClick={() => onGrade(Rating.Hard)}>{t("session.hard")}</button>
            <button type="button" className="btn btn-primary grade" onClick={() => onGrade(Rating.Good)}>{t("session.good")}</button>
            <button type="button" className="btn btn-quiet grade" onClick={() => onGrade(Rating.Easy)}>{t("session.easy")}</button>
          </div>
        </>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setShown(true)}>{t("session.reveal")}</button>
      )}
    </div>
  );
}
