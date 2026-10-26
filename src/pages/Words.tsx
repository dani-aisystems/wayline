import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { library } from "../content/library";
import { localize } from "../content/schema";
import { useProfile } from "../state/profile";
import { LensText } from "../components/lens/Lens";
import { relativeDay } from "../lib/time";
import "./words.css";

export function Words() {
  const { t, lang } = useProfile();
  const words = useLiveQuery(() => db.cards.where("kind").equals("word").toArray(), []);
  if (!words) return <div className="page" aria-busy="true" />;
  const rows = words
    .map((c) => ({ card: c, entry: library.lens.get(c.ref.split("|")[0].toLowerCase()) }))
    .filter((r) => r.entry)
    .sort((a, b) => b.card.createdAt.localeCompare(a.card.createdAt));

  return (
    <div className="page">
      <h1 className="page-title">{t("words.title")}</h1>
      <p className="page-lead">{rows.length ? t("words.lead") : t("words.empty")}</p>
      {rows.length > 0 && (
        <>
          <p className="today-stats">{t("words.count", { n: String(rows.length) })}</p>
          <ul className="word-list">
            {rows.map(({ card, entry }) => (
              <li key={card.id} className="word-row">
                <div>
                  <p className="word-row-head">
                    <LensText text={entry!.word} context={card.context} className="word-row-word" />
                    {entry!.ipa && <span className="word-row-ipa">{entry!.ipa}</span>}
                  </p>
                  <p className="word-row-meaning">{localize(entry!.meaning, lang)}</p>
                  {card.context && <p className="word-row-context" lang="en">“{card.context}”</p>}
                </div>
                <p className="word-row-due">{t("review.nextDue", { when: relativeDay(card.fsrs.due, lang) })}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
