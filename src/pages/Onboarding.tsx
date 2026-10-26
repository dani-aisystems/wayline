import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "../state/profile";
import { Wordmark } from "../components/Logo";
import type { Profile } from "../db/db";
import type { StringKey } from "../i18n/strings";
import "./onboarding.css";

const GOALS = ["everyday", "work", "study", "travel", "exam", "allround"] as const;
const TOPICS = ["tech", "sport", "film", "business", "science", "travel", "food", "music", "history", "society"] as const;
const TIMES = [10, 20, 30, 45] as const;

type Draft = {
  canRead: boolean | null;
  goal: Profile["goal"] | null;
  interests: string[];
  minutes: Profile["dailyMinutes"] | null;
};

export function Onboarding() {
  const { t, update } = useProfile();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>({ canRead: null, goal: null, interests: [], minutes: null });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const total = 4;

  useEffect(() => headingRef.current?.focus(), [step]);

  const canNext = [d.canRead !== null, d.goal !== null, true, d.minutes !== null][step];

  const finish = async () => {
    await update({
      placedBand: d.canRead ? "A1" : "preA1",
      acceptedBand: d.canRead ? "A1" : "preA1",
      goal: d.goal ?? "allround",
      interests: d.interests,
      dailyMinutes: d.minutes ?? 20,
      onboardedAt: new Date().toISOString(),
    });
    navigate("/today", { replace: true });
  };

  const questions: StringKey[] = ["onb.read.question", "onb.goal.question", "onb.interests.question", "onb.time.question"];

  return (
    <div className="onb">
      <header className="onb-bar">
        <Wordmark height={26} />
        <p className="onb-step">{t("onb.step", { n: String(step + 1), total: String(total) })}</p>
      </header>
      <div className="onb-track" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="onb-dot" data-state={i < step ? "done" : i === step ? "now" : "next"} />
        ))}
      </div>

      <main className="onb-main">
        <h1 id="onb-q" className="onb-question" tabIndex={-1} ref={headingRef}>{t(questions[step])}</h1>

        {step === 0 && (
          <>
            <p className="onb-sample" lang="en">{t("onb.read.sample")}</p>
            <Options
              name="canRead"
              value={d.canRead === null ? null : String(d.canRead)}
              options={[
                { value: "true", label: t("onb.read.yes") },
                { value: "false", label: t("onb.read.no") },
              ]}
              onChange={(v) => setD({ ...d, canRead: v === "true" })}
            />
            {d.canRead === false && <p className="onb-note">{t("onb.read.noHint")}</p>}
          </>
        )}

        {step === 1 && (
          <Options
            name="goal"
            value={d.goal}
            options={GOALS.map((g) => ({ value: g, label: t(`onb.goal.${g}` as StringKey) }))}
            onChange={(v) => setD({ ...d, goal: v as Draft["goal"] })}
          />
        )}

        {step === 2 && (
          <>
            <p className="onb-hint">{t("onb.interests.hint")}</p>
            <fieldset className="onb-chips">
              <legend className="visually-hidden">{t("onb.interests.question")}</legend>
              {TOPICS.map((topic) => {
                const on = d.interests.includes(topic);
                const full = d.interests.length >= 3 && !on;
                return (
                  <label key={topic} className="chip" data-on={on} data-disabled={full}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={full}
                      onChange={() =>
                        setD({ ...d, interests: on ? d.interests.filter((x) => x !== topic) : [...d.interests, topic] })
                      }
                    />
                    {t(`topic.${topic}` as StringKey)}
                  </label>
                );
              })}
            </fieldset>
            <p className="onb-count" aria-live="polite">{t("onb.interests.selected", { n: String(d.interests.length) })}</p>
          </>
        )}

        {step === 3 && (
          <>
            <p className="onb-hint">{t("onb.time.hint")}</p>
            <Options
              name="minutes"
              value={d.minutes ? String(d.minutes) : null}
              options={TIMES.map((m) => ({
                value: String(m),
                label: t("onb.time.minutes", { n: String(m) }),
                detail: t(`onb.time.${m}` as StringKey),
              }))}
              onChange={(v) => setD({ ...d, minutes: Number(v) as Draft["minutes"] })}
            />
            <p className="onb-note">{t(d.canRead ? "onb.startNote.A1" : "onb.startNote.preA1")}</p>
          </>
        )}

        <div className="onb-actions">
          {step > 0 && (
            <button type="button" className="btn btn-quiet" onClick={() => setStep(step - 1)}>{t("onb.back")}</button>
          )}
          {step < total - 1 ? (
            <button type="button" className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {t("onb.next")}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!canNext} onClick={finish}>
              {t("onb.finish")}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Options({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string | null | undefined;
  options: { value: string; label: string; detail?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="onb-options" role="radiogroup" aria-labelledby="onb-q">
      {options.map((o) => (
        <label key={o.value} className="onb-option" data-checked={value === o.value}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span className="onb-option-label">{o.label}</span>
          {o.detail && <span className="onb-option-detail">{o.detail}</span>}
        </label>
      ))}
    </div>
  );
}
