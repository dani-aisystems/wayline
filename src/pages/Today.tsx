import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { library, bandAtLeast } from "../content/library";
import { localize } from "../content/schema";
import { db } from "../db/db";
import { competenceProgress, localDay, planSession, startBand } from "../engine/progress";
import { useProfile } from "../state/profile";
import "./today.css";

const BACKUP_EVERY_DAYS = 14;

export function Today() {
  const { t, lang, profile } = useProfile();
  const data = useLiveQuery(async () => {
    if (!profile) return null;
    const [progress, plan, today, cardCount] = await Promise.all([
      competenceProgress(undefined, undefined, startBand(profile)),
      planSession(profile),
      db.activity.get(localDay()),
      db.cards.count(),
    ]);
    return { progress, plan, today, cardCount };
  }, [profile]);

  if (!profile || !data) return <div className="page" aria-busy="true" />;

  const { progress, plan, today, cardCount } = data;
  const from = startBand(profile);
  const route = library.competences.filter((c) => bandAtLeast(c.band, from));
  const current = plan.competenceId ? library.competence.get(plan.competenceId) : undefined;
  const cp = current ? progress.get(current.id) : undefined;
  const reviews = plan.steps.filter((s) => s.kind.startsWith("review")).length;
  const fresh = plan.steps.filter((s) => s.kind === "item").length;
  const studiedToday = (today?.newItems ?? 0) + (today?.reviews ?? 0) > 0;
  const daysSinceBackup = profile.lastBackupAt ? (Date.now() - Date.parse(profile.lastBackupAt)) / 86_400_000 : Infinity;
  const needsBackup = cardCount >= 15 && daysSinceBackup > BACKUP_EVERY_DAYS;

  return (
    <div className="page today">
      <h1 className="page-title">{t("today.title")}</h1>

      {needsBackup && (
        <div className="banner" role="note">
          <p>{t("today.backup")}</p>
          <Link className="btn btn-quiet btn-small" to="/settings#backup">{t("today.backupAction")}</Link>
        </div>
      )}

      {profile.placementSource !== "diagnostic" && profile.placedBand !== "preA1" && (
        <div className="banner banner-info" role="note">
          <p>{t("today.diagnosticOffer")}</p>
          <Link className="btn btn-primary btn-small" to="/placement">{t("today.diagnosticAction")}</Link>
        </div>
      )}

      <section className="today-card" aria-labelledby="today-region">
        {current && cp ? (
          <>
            <p className="today-eyebrow">{t("today.region")}</p>
            <h2 id="today-region" className="today-region">{localize(current.title, lang)}</h2>
            <p className="today-cando">{localize(current.canDo, lang)}</p>
            <div className="today-meter" aria-hidden="true">
              <div className="today-meter-fill" style={{ width: `${(cp.answered / Math.max(cp.total, 1)) * 100}%` }} />
            </div>
            <p className="today-stats">
              <span>{t("today.progress", { done: String(cp.answered), total: String(cp.total) })}</span>
              <span>{reviews ? t("today.reviewsDue", { n: String(reviews) }) : t("today.reviewsNone")}</span>
              {fresh > 0 && <span>{t("today.newItems", { n: String(fresh) })}</span>}
            </p>
          </>
        ) : (
          <h2 id="today-region" className="today-region">{plan.routeComplete ? t("today.routeDone") : t("today.nothing")}</h2>
        )}
        {studiedToday && plan.steps.length > 0 && <p className="today-done">{t("today.doneToday")}</p>}
        {plan.steps.length > 0 && (
          <Link className="btn btn-primary today-start" to="/session">
            {studiedToday ? t("today.again") : t("today.start")}
          </Link>
        )}
        {plan.deferredReviews > 0 && <p className="today-deferred">{t("today.deferred", { n: String(plan.deferredReviews) })}</p>}
      </section>

      <section aria-labelledby="route-title" className="route">
        <h2 id="route-title" className="section-title">{t("today.route")}</h2>
        <ol className="route-list">
          {route.map((c) => {
            const p = progress.get(c.id)!;
            const state = p.mastered ? "mastered" : c.id === current?.id ? "current" : p.answered === p.total ? "practised" : p.unlocked ? "open" : "locked";
            const blocker = c.prerequisites.map((id) => library.competence.get(id)).find((pre) => pre && progress.get(pre.id)!.answered < progress.get(pre.id)!.total);
            return (
              <li key={c.id} className="route-stop" data-state={state} aria-current={state === "current" ? "step" : undefined}>
                <span className="route-node" aria-hidden="true" />
                <div className="route-text">
                  <p className="route-name">
                    {localize(c.title, lang)} <span className="route-band">{c.band === "preA1" ? "Pre-A1" : c.band}</span>
                  </p>
                  <p className="route-detail">
                    {state === "mastered"
                      ? t("today.mastered")
                      : state === "locked" && blocker
                        ? t("today.locked", { name: localize(blocker.title, lang) })
                        : t("today.progress", { done: String(p.answered), total: String(p.total) })}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
