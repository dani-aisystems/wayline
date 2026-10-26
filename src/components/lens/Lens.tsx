import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { library } from "../../content/library";
import { localize, type GlossaryEntry } from "../../content/schema";
import { db } from "../../db/db";
import { removeWord, saveWord } from "../../engine/progress";
import { speak } from "../../lib/speech";
import { useProfile } from "../../state/profile";
import "./lens.css";

type Lookup = { word: string; context?: string; entry?: GlossaryEntry; isName: boolean };
const LensContext = createContext<(l: Lookup) => void>(() => {});

/** Lowercase lookup, tolerating curly apostrophes and possessive 's. */
export function lookup(word: string): Pick<Lookup, "entry" | "isName"> {
  const w = word.replace(/’/g, "'").toLowerCase();
  const entry = library.lens.get(w) ?? (w.endsWith("'s") ? library.lens.get(w.slice(0, -2)) : undefined);
  return { entry, isName: !entry && library.names.has(w.replace(/'s$/, "")) };
}

/**
 * English text where every word is a button that opens Word Lens.
 * `context` is the sentence saved with the word; defaults to the text itself.
 */
export function LensText({ text, context, className }: { text: string; context?: string; className?: string }) {
  const open = useContext(LensContext);
  const parts = text.split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/);
  return (
    <span className={className} lang="en">
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const { entry, isName } = lookup(part);
        return (
          <button
            key={i}
            type="button"
            className={`lens-word${entry ? "" : " lens-word-plain"}`}
            onClick={() => open({ word: part, context: context ?? text, entry, isName })}
          >
            {part}
          </button>
        );
      })}
    </span>
  );
}

export function LensProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Lookup | null>(null);
  const open = useCallback((l: Lookup) => setCurrent(l), []);
  return (
    <LensContext.Provider value={open}>
      {children}
      {current && <WordSheet lookup={current} onClose={() => setCurrent(null)} />}
    </LensContext.Provider>
  );
}

function WordSheet({ lookup: l, onClose }: { lookup: Lookup; onClose: () => void }) {
  const { t, lang, profile } = useProfile();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const entry = l.entry;
  const cardId = entry ? `word:${entry.word.toLowerCase()}|${entry.pos}` : "";
  const saved = useLiveQuery(() => (cardId ? db.cards.get(cardId).then(Boolean) : false), [cardId]);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="lens-sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <div className="lens-inner">
        <div className="lens-head">
          <div>
            <h2 id={titleId} className="lens-title" lang="en">{entry?.word ?? l.word}</h2>
            {entry && (
              <p className="lens-meta">
                {entry.ipa && <span className="lens-ipa">{entry.ipa}</span>}
                <span>{t(`pos.${entry.pos}` as never)}</span>
                <span className="lens-band">{entry.band === "preA1" ? "Pre-A1" : entry.band}</span>
              </p>
            )}
          </div>
          <button type="button" className="btn btn-quiet lens-close" onClick={onClose}>{t("lens.close")}</button>
        </div>

        {entry ? (
          <>
            <p className="lens-meaning">{localize(entry.meaning, lang)}</p>
            <p className="lens-label">{t("lens.example")}</p>
            <p className="lens-example" lang="en">{entry.example}</p>
            {l.context && l.context !== entry.example && <p className="lens-context" lang="en">“{l.context}”</p>}
            <div className="lens-actions">
              <button type="button" className="btn btn-quiet" onClick={() => speak(entry.word, { voiceId: profile?.voiceId })}>
                {t("session.listen")}
              </button>
              {saved ? (
                <button type="button" className="btn btn-quiet" onClick={() => removeWord(entry)} aria-pressed="true">
                  {t("lens.saved")}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => saveWord(entry, l.context)}>
                  {t("lens.save")}
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="lens-meaning">{l.isName ? t("lens.name") : t("lens.unknown")}</p>
        )}
      </div>
    </dialog>
  );
}
