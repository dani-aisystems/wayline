import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { library } from "../../content/library";
import { db } from "../../db/db";
import { recordItem, type Outcome } from "../../engine/progress";
import { awardForItem, checkAchievements } from "../../engine/xp";
import { useProfile } from "../../state/profile";
import { Exercise } from "../../components/exercise/Exercise";
import { LensText } from "../../components/lens/Lens";
import "./session.css";

/**
 * Practice chosen exercises outside the daily plan (from the library or the mistake notebook).
 * Answers are recorded exactly like lesson answers, so reviews, mastery and mistakes stay in sync.
 */
export function Practice() {
  const { t } = useProfile();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [items] = useState(() =>
    (params.get("ids") ?? "")
      .split(",")
      .map((id) => library.item.get(id))
      .filter((i) => i !== undefined)
      .slice(0, 20),
  );
  const [index, setIndex] = useState(0);
  const [first, setFirst] = useState(0);
  const [xp, setXp] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const started = useRef(0);
  const done = index >= items.length;

  useEffect(() => {
    heading.current?.focus();
    started.current = Date.now();
  }, [index]);

  if (!items.length) {
    return (
      <div className="session session-empty">
        <p>{t("practice.none")}</p>
        <Link className="btn btn-primary" to="/library">{t("practice.back")}</Link>
      </div>
    );
  }

  const onDone = async (outcome: Outcome, given: string) => {
    const item = items[index];
    const isNew = !(await db.cards.get(`item:${item.id}`));
    const seconds = Math.min((Date.now() - started.current) / 1000, 300);
    await recordItem(item, outcome, given, { seconds });
    const gained = await awardForItem(item, isNew);
    setXp((x) => x + gained);
    if (outcome === "first") setFirst((n) => n + 1);
    if (index + 1 >= items.length) await checkAchievements();
    setIndex((i) => i + 1);
  };

  const item = items[Math.min(index, items.length - 1)];
  const text = item.textId ? library.text.get(item.textId) : undefined;

  return (
    <div className="session">
      <header className="session-bar">
        <button type="button" className="btn btn-quiet btn-small" onClick={() => navigate(-1)}>{t("session.close")}</button>
        <div className="session-progress" role="progressbar" aria-label={t("practice.progress", { n: String(Math.min(index + 1, items.length)), total: String(items.length) })} aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={index}>
          <div className="session-progress-fill" style={{ width: `${(index / items.length) * 100}%` }} />
        </div>
      </header>
      <main className="session-main" key={done ? "done" : index}>
        <h1 className="visually-hidden" tabIndex={-1} ref={heading}>
          {done ? t("practice.title") : t("practice.progress", { n: String(index + 1), total: String(items.length) })}
        </h1>
        {done ? (
          <div className="step step-summary">
            <h2 className="step-title">{t("practice.finished", { n: String(first), total: String(items.length) })}</h2>
            {xp > 0 && <p className="summary-xp">{t("session.xp", { n: String(xp) })}</p>}
            <div className="lib-word-actions">
              <Link className="btn btn-primary" to="/library">{t("practice.back")}</Link>
              <Link className="btn btn-quiet" to="/today">{t("session.backHome")}</Link>
            </div>
          </div>
        ) : (
          <>
            {text && (
              <details className="practice-text">
                <summary lang="en">{text.title}</summary>
                {text.paragraphs.map((p, i) => <p key={i}><LensText text={p} /></p>)}
              </details>
            )}
            <Exercise item={item} onDone={onDone} />
          </>
        )}
      </main>
    </div>
  );
}
