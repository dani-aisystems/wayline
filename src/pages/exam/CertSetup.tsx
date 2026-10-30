import { useState } from "react";
import type { CertExam, CertGoal } from "../../db/db";
import { EXAMS } from "../../content/exams/spec";
import { useProfile } from "../../state/profile";
import type { StringKey } from "../../i18n/strings";
import "./exam.css";

/* ───────────────────────── Goal setup (also used in onboarding and settings) ───────────────────────── */

export function CertSetup({ initial, onSave, saveLabel }: { initial?: CertGoal; onSave: (c: CertGoal) => void; saveLabel?: string }) {
  const { t } = useProfile();
  const [exam, setExam] = useState<CertExam | null>(initial?.exam ?? null);
  const [date, setDate] = useState(initial?.date ?? "");
  const [target, setTarget] = useState<number | null>(initial?.target ?? null);
  const [format, setFormat] = useState<CertGoal["format"]>(initial?.format ?? "digital");
  const spec = exam ? EXAMS[exam] : null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="ex-setup">
      <fieldset className="ex-field">
        <legend className="setting-label">{t("exam.setup.which")}</legend>
        <div className="ex-exam-cards">
          {(["b2-first", "c1-advanced"] as const).map((id) => (
            <label key={id} className="ex-exam-card" data-selected={exam === id}>
              <input type="radio" name="cert-exam" checked={exam === id} onChange={() => { setExam(id); setTarget(EXAMS[id].grades[2].min); }} />
              <span className="ex-exam-name">{EXAMS[id].name} <span className="card-meta">({EXAMS[id].short}) · Cambridge English</span></span>
              <span className="setting-hint">{t(`exam.setup.about.${id}` as StringKey)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {spec && (
        <>
          <div className="ex-field">
            <label className="setting-label" htmlFor="cert-date">{t("exam.setup.date")}</label>
            <input id="cert-date" type="date" className="input input-small" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            <p className="setting-hint">{t("exam.setup.dateHint")}</p>
          </div>
          <fieldset className="ex-field">
            <legend className="setting-label">{t("exam.setup.target")}</legend>
            <div className="chip-row">
              {spec.grades.slice(0, 3).map((g) => (
                <button key={g.label} type="button" className="chip" aria-pressed={target === g.min} onClick={() => setTarget(g.min)}>
                  {g.label} · {g.min}+
                </button>
              ))}
            </div>
            <p className="setting-hint">{t("exam.setup.targetHint")}</p>
          </fieldset>
          <fieldset className="ex-field">
            <legend className="setting-label">{t("exam.setup.format")}</legend>
            <div className="chip-row">
              {(["digital", "paper"] as const).map((f) => (
                <button key={f} type="button" className="chip" aria-pressed={format === f} onClick={() => setFormat(f)}>{t(`exam.setup.${f}` as StringKey)}</button>
              ))}
            </div>
            <p className="setting-hint">{t("exam.setup.formatHint")}</p>
          </fieldset>
          <button type="button" className="btn btn-primary" onClick={() => onSave({ exam: exam!, date: date || undefined, target: target ?? undefined, format, setAt: new Date().toISOString() })}>
            {saveLabel ?? t("exam.setup.save")}
          </button>
        </>
      )}
    </div>
  );
}

