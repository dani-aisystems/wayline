import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { reviewCap } from "../lib/srs";
import { useProfile } from "../state/profile";
import { relativeDay } from "../lib/time";

export function Review() {
  const { t, lang, profile } = useProfile();
  const data = useLiveQuery(async () => {
    const now = Date.now();
    const cards = await db.cards.toArray();
    const due = cards.filter((c) => c.fsrs.due.getTime() <= now).length;
    const next = cards.filter((c) => c.fsrs.due.getTime() > now).sort((a, b) => a.fsrs.due.getTime() - b.fsrs.due.getTime())[0];
    return { due, next: next?.fsrs.due, total: cards.length };
  }, []);

  if (!data) return <div className="page" aria-busy="true" />;
  const n = Math.min(data.due, reviewCap(profile?.dailyMinutes ?? 20));

  return (
    <div className="page">
      <h1 className="page-title">{t("review.title")}</h1>
      <p className="page-lead">{t("review.lead")}</p>
      {n > 0 ? (
        <Link className="btn btn-primary" to="/review/session" style={{ justifySelf: "start" }}>
          {t("review.start", { n: String(n) })}
        </Link>
      ) : (
        <div className="today-card">
          <p>{t("review.none")}</p>
          {data.next && <p className="today-stats">{t("review.nextDue", { when: relativeDay(data.next, lang) })}</p>}
        </div>
      )}
    </div>
  );
}
