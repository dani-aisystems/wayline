import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type PlacementRow } from "../../db/db";
import { BAND_FLOOR, DIAG_BANDS } from "../../content/diagnostic";
import { ALL_BANDS } from "../../engine/placement";
import { library } from "../../content/library";
import { useProfile } from "../../state/profile";
import { topicName } from "../../i18n/topics";
import type { StringKey } from "../../i18n/strings";
import type { Band } from "../../content/schema";
import { Wordmark } from "../../components/Logo";
import "./placement.css";

type AnyBand = (typeof ALL_BANDS)[number];
const label = (b: string) => (b === "preA1" ? "Pre-A1" : b);

/** The ability scale shown on the results screen, from Pre-A1 to the top of C2. */
const SCALE_MIN = -6;
const SCALE_MAX = 5.5;
const pct = (theta: number) => ((Math.min(SCALE_MAX, Math.max(SCALE_MIN, theta)) - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

export function PlacementResult() {
  const { t, lang, profile, update } = useProfile();
  const navigate = useNavigate();
  const { id } = useParams();
  const row = useLiveQuery(() => (id ? db.placements.get(Number(id)) : db.placements.orderBy("at").last()), [id]);

  if (!profile || row === undefined) return <div className="pl" aria-busy="true" />;
  if (!row) {
    navigate("/placement", { replace: true });
    return null;
  }
  const r = row.result;
  const rec = r.recommended as AnyBand;
  const i = ALL_BANDS.indexOf(rec);
  const lower = i > 0 ? ALL_BANDS[i - 1] : null;
  const higher = i < ALL_BANDS.length - 1 ? ALL_BANDS[i + 1] : null;
  const hasLessons = (b: AnyBand) => library.competences.some((c) => c.band === b);

  const accept = async (band: AnyBand) => {
    await db.placements.update(row.id!, { accepted: band });
    await update({
      placedBand: r.band as Band,
      acceptedBand: band as Band,
      placementSource: "diagnostic",
      onboardedAt: profile.onboardedAt ?? new Date().toISOString(),
    });
    navigate("/today", { replace: true });
  };

  const why = rec === "C2" ? t("res.whyTop") : rec === "preA1" ? t("res.whyBottom") : t("res.whyText", {
    band: label(r.band),
    next: label(ALL_BANDS[Math.min(ALL_BANDS.indexOf(r.band as AnyBand) + 1, ALL_BANDS.length - 1)]),
    start: label(rec),
  });

  return (
    <div className="pl pl-result">
      <header className="pl-bar"><Wordmark height={26} /></header>
      <main className="res">
        <section className="res-head" aria-labelledby="res-title">
          <p className="step-label" id="res-title">{t("res.estimate")}</p>
          <p className="res-band">{label(r.band)}</p>
          <p className="res-range">
            {r.range[0] === r.range[1] ? t("res.rangeOne", { lo: label(r.range[0]) }) : t("res.range", { lo: label(r.range[0]), hi: label(r.range[1]) })}
          </p>
          <p className="res-meta">
            <span className={`pill pill-${r.confidence}`}>{t(`res.confidence.${r.confidence}` as StringKey)}</span>
            <span>{t("res.items", { n: String(r.items) })}</span>
          </p>
          <Scale row={row} />
        </section>

        <section className="res-section" aria-labelledby="res-skills">
          <h2 id="res-skills" className="section-title">{t("res.skills")}</h2>
          <ul className="res-skills">
            {r.skills.map((k) => (
              <li key={k.skill} className="res-skill">
                <span className="res-skill-name">{t(`test.skill.${k.skill}` as StringKey)}</span>
                {k.theta !== null ? (
                  <>
                    <span className="res-skill-track" aria-hidden="true">
                      <span className="res-skill-fill" style={{ width: `${pct(k.theta)}%` }} />
                    </span>
                    <span className="res-skill-band">
                      {label(k.band!)}
                      {r.strongSkills.includes(k.skill) && <span className="pill pill-good">{t("res.strengths")}</span>}
                      {r.weakSkills.includes(k.skill) && <span className="pill pill-warn">{t("res.focus")}</span>}
                    </span>
                  </>
                ) : (
                  <span className="res-skill-none">{r.skipped.includes(k.skill) ? t("res.skippedListening") : t("res.notEnough")}</span>
                )}
              </li>
            ))}
            <li className="res-skill">
              <span className="res-skill-name">{t("skill.speaking")}</span>
              <span className="res-skill-none">{t("res.notAssessed")}</span>
            </li>
            <li className="res-skill">
              <span className="res-skill-name">{t("skill.writing")}</span>
              <span className="res-skill-none">{t("res.notAssessed")}</span>
            </li>
          </ul>
          <p className="setting-hint">{t("res.speakingNote")}</p>
        </section>

        <section className="res-section" aria-labelledby="res-topics">
          <h2 id="res-topics" className="section-title">{t("res.topics")}</h2>
          {r.weakTopics.length ? (
            <ul className="res-topics">
              {r.weakTopics.map((w) => <li key={w.topic}>{topicName(w.topic, lang)}</li>)}
            </ul>
          ) : (
            <p className="setting-hint">{t("res.noTopics")}</p>
          )}
        </section>

        <section className="res-section res-why" aria-labelledby="res-why">
          <h2 id="res-why" className="section-title">{t("res.why")}</h2>
          <p>{why}</p>
          <p className="setting-hint">{t("res.daily", { n: String(profile.dailyMinutes ?? 20) })} {t("res.dailyHint")}</p>
          {!hasLessons(rec) && <p className="onb-note">{t("res.noContentYet", { band: label(rec) })}</p>}
        </section>

        <div className="res-actions">
          <button type="button" className="btn btn-primary" onClick={() => accept(rec)}>{t("res.start", { band: label(rec) })}</button>
          {lower && <button type="button" className="btn btn-quiet" onClick={() => accept(lower)}>{t("res.startLower", { band: label(lower) })}</button>}
          {higher && <button type="button" className="btn btn-quiet" onClick={() => accept(higher)}>{t("res.startHigher", { band: label(higher) })}</button>}
        </div>
        {row.mode === "quick" && (
          <div className="res-extended">
            <button type="button" className="btn btn-quiet btn-small" onClick={() => navigate("/placement?mode=extended")}>{t("res.extended")}</button>
            <p className="setting-hint">{t("res.extendedHint")}</p>
          </div>
        )}
        <p className="res-disclaimer">{t("res.disclaimer")}</p>
      </main>
    </div>
  );
}

/** CEFR scale with the band edges, the likely range and the estimate. */
function Scale({ row }: { row: PlacementRow }) {
  const r = row.result;
  const lo = pct(r.theta - 1.28 * r.se);
  const hi = pct(r.theta + 1.28 * r.se);
  const edges = DIAG_BANDS.map((b) => ({ b, at: pct(BAND_FLOOR[b]) }));
  return (
    <div className="scale" aria-hidden="true">
      <div className="scale-track">
        <span className="scale-range" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        <span className="scale-mark" style={{ left: `${pct(r.theta)}%` }} />
        {edges.map((e) => <span key={e.b} className="scale-edge" style={{ left: `${e.at}%` }} />)}
      </div>
      <div className="scale-labels">
        <span style={{ left: `${pct(-5.25)}%` }}>Pre-A1</span>
        {DIAG_BANDS.map((b, k) => {
          const next = k + 1 < DIAG_BANDS.length ? BAND_FLOOR[DIAG_BANDS[k + 1]] : SCALE_MAX;
          return <span key={b} style={{ left: `${pct((BAND_FLOOR[b] + next) / 2)}%` }}>{b}</span>;
        })}
      </div>
    </div>
  );
}
