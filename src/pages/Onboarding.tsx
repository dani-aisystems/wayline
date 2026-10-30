import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProfile } from "../state/profile";
import { Wordmark } from "../components/Logo";
import type { CertGoal, Profile } from "../db/db";
import { CertSetup } from "./exam/CertSetup";
import type { StringKey } from "../i18n/strings";
import "./onboarding.css";

const GOALS = ["everyday", "travel", "work", "study", "academic", "speaking", "exam", "allround"] as const;
const SKILLS = ["speaking", "listening", "reading", "writing", "grammar", "vocabulary"] as const;
const TOPICS = ["tech", "sport", "film", "business", "science", "travel", "food", "music", "history", "society"] as const;
const TIMES = [10, 20, 30, 45] as const;
const SELF = ["few-words", "basic", "conversations", "comfortable", "fluent", "unsure"] as const;

type Goal = (typeof GOALS)[number];
type Draft = {
  canRead: boolean | null;
  goal: Goal | null;
  skills: string[];
  interests: string[];
  minutes: Profile["dailyMinutes"] | null;
  self: (typeof SELF)[number] | null;
  cert: CertGoal | null;
};

/** Profile goals predate "academic" and "speaking"; map the new ones onto stored values plus focus skills. */
function storedGoal(g: Goal): NonNullable<Profile["goal"]> {
  if (g === "academic") return "study";
  if (g === "speaking") return "everyday";
  return g;
}

/**
 * Goals and context. These answers decide WHAT the learner studies; the level test decides WHERE they start.
 * Learners who can't read English yet skip the test and start with letters and sounds.
 */
export function Onboarding() {
  const { t, update } = useProfile();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>({ canRead: null, goal: null, skills: [], interests: [], minutes: null, self: null, cert: null });
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Beginners who can't read skip the self-description step.
  // Certification preparation (B2/C1) asks for the exam right after the goal.
  const steps: readonly ("read" | "goal" | "cert" | "skills" | "interests" | "time" | "self")[] =
    d.canRead === false
      ? ["read", "goal", "skills", "interests", "time"]
      : d.goal === "exam"
        ? ["read", "goal", "cert", "skills", "interests", "time", "self"]
        : ["read", "goal", "skills", "interests", "time", "self"];
  const total = steps.length;
  const name = steps[Math.min(step, total - 1)];

  useEffect(() => headingRef.current?.focus(), [step]);

  const canNext = { read: d.canRead !== null, goal: d.goal !== null, cert: !!d.cert, skills: true, interests: true, time: d.minutes !== null, self: d.self !== null }[name];

  const finish = async () => {
    const goal = d.goal ?? "allround";
    const focus = new Set(d.skills);
    if (goal === "speaking") focus.add("speaking");
    if (goal === "academic") { focus.add("writing"); focus.add("reading"); }
    const base = {
      goal: storedGoal(goal),
      focusSkills: [...focus],
      interests: d.interests,
      dailyMinutes: d.minutes ?? 20,
      ...(d.cert && d.canRead !== false ? { track: "exam" as const, cert: d.cert } : { track: "general" as const }),
    };
    if (d.canRead === false) {
      await update({ ...base, placedBand: "preA1", acceptedBand: "preA1", placementSource: "chosen", onboardedAt: new Date().toISOString() });
      navigate("/today", { replace: true });
    } else {
      await update({ ...base, selfRating: d.self ?? "unsure" });
      navigate("/placement", { replace: true });
    }
  };

  const questions: Record<typeof name, StringKey> = {
    read: "onb.read.question",
    goal: "onb.goal.question",
    cert: "exam.setup.which",
    skills: "onb.skills.question",
    interests: "onb.interests.question",
    time: "onb.time.question",
    self: "onb.self.question",
  };
  const last = step === total - 1;

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
        <h1 id="onb-q" className="onb-question" tabIndex={-1} ref={headingRef}>{t(questions[name])}</h1>

        {name === "cert" && (
          <CertSetup initial={d.cert ?? undefined} saveLabel={t("onb.next")} onSave={(c) => { setD({ ...d, cert: c }); setStep((x) => x + 1); }} />
        )}

        {name === "read" && (
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

        {name === "goal" && (
          <Options
            name="goal"
            value={d.goal}
            options={GOALS.map((g) => ({ value: g, label: t(`onb.goal.${g}` as StringKey) }))}
            onChange={(v) => setD({ ...d, goal: v as Goal })}
          />
        )}

        {name === "skills" && (
          <>
            <p className="onb-hint">{t("onb.skills.hint")}</p>
            <Chips
              legend={t("onb.skills.question")}
              values={SKILLS.map((k) => ({ value: k, label: t(`skill.${k}` as StringKey) }))}
              selected={d.skills}
              onChange={(skills) => setD({ ...d, skills })}
            />
          </>
        )}

        {name === "interests" && (
          <>
            <p className="onb-hint">{t("onb.interests.hint")}</p>
            <Chips
              legend={t("onb.interests.question")}
              values={TOPICS.map((k) => ({ value: k, label: t(`topic.${k}` as StringKey) }))}
              selected={d.interests}
              max={3}
              onChange={(interests) => setD({ ...d, interests })}
            />
            <p className="onb-count" aria-live="polite">{t("onb.interests.selected", { n: String(d.interests.length) })}</p>
          </>
        )}

        {name === "time" && (
          <>
            <p className="onb-hint">{t("onb.time.hint")}</p>
            <Options
              name="minutes"
              value={d.minutes ? String(d.minutes) : null}
              options={TIMES.map((m) => ({ value: String(m), label: t("onb.time.minutes", { n: String(m) }), detail: t(`onb.time.${m}` as StringKey) }))}
              onChange={(v) => setD({ ...d, minutes: Number(v) as Draft["minutes"] })}
            />
            {d.canRead === false && <p className="onb-note">{t("onb.startNote.preA1")}</p>}
          </>
        )}

        {name === "self" && (
          <>
            <p className="onb-hint">{t("onb.self.hint")}</p>
            <Options
              name="self"
              value={d.self}
              options={SELF.map((k) => ({ value: k, label: t(`onb.self.${k}` as StringKey) }))}
              onChange={(v) => setD({ ...d, self: v as Draft["self"] })}
            />
          </>
        )}

        <div className="onb-actions">
          {step > 0 && <button type="button" className="btn btn-quiet" onClick={() => setStep(step - 1)}>{t("onb.back")}</button>}
          {last ? (
            <button type="button" className="btn btn-primary" disabled={!canNext} onClick={finish}>
              {d.canRead === false ? t("onb.finish") : t("onb.toTest")}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t("onb.next")}</button>
          )}
        </div>
      </main>
    </div>
  );
}

function Options({ name, value, options, onChange }: { name: string; value: string | null | undefined; options: { value: string; label: string; detail?: string }[]; onChange: (v: string) => void }) {
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

function Chips({ legend, values, selected, onChange, max }: { legend: string; values: { value: string; label: string }[]; selected: string[]; onChange: (v: string[]) => void; max?: number }) {
  return (
    <fieldset className="onb-chips">
      <legend className="visually-hidden">{legend}</legend>
      {values.map(({ value, label }) => {
        const on = selected.includes(value);
        const full = max !== undefined && selected.length >= max && !on;
        return (
          <label key={value} className="chip" data-on={on} data-disabled={full}>
            <input type="checkbox" checked={on} disabled={full} onChange={() => onChange(on ? selected.filter((x) => x !== value) : [...selected, value])} />
            {label}
          </label>
        );
      })}
    </fieldset>
  );
}
