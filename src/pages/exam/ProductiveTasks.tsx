import { useEffect, useState } from "react";
import { localize, type LocalizedText } from "../../content/schema";
import type { ExamTask } from "../../content/exams/schema";
import { partSpec } from "../../content/exams/spec";
import { checkWriting, SUBSCALES, type Subscale } from "../../engine/exam/writing";
import { EXAMINER_VOICE } from "../../engine/exam/audio";
import { speak, stopSpeaking } from "../../lib/speech";
import { Recorder, type Take } from "../../components/speaking/Recorder";
import { useProfile } from "../../state/profile";
import type { StringKey } from "../../i18n/strings";

type Writing = Extract<ExamTask, { kind: "writing" }>;
type Speaking = Extract<ExamTask, { kind: "speaking" }>;

const countWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/* ───────────────────────── Writing ───────────────────────── */

export function WritingTaskView({ task, text, onChange, readOnly }: { task: Writing; text: string; onChange: (v: string) => void; readOnly?: boolean }) {
  const { t } = useProfile();
  const [lo, hi] = partSpec(task.exam, "writing", task.part)!.words!;
  const n = countWords(text);
  const state = n === 0 ? "" : n < lo ? "under" : n > hi ? "over" : "ok";
  return (
    <article className="ex-task" data-kind="writing" data-task-id={task.id}>
      <header className="ex-task-head">
        <p className="card-meta">{t("exam.writingPart", { part: String(task.part) })} · {t(`genre.${task.genre}` as StringKey)}</p>
        <p className="ex-instructions" lang="en">{task.instructions}</p>
      </header>
      <div className="ex-prompt" lang="en">{task.prompt.split(/\n\s*\n|\n/).map((p, i) => <p key={i}>{p}</p>)}</div>
      <label className="visually-hidden" htmlFor={`w-${task.id}`}>{t("exam.yourAnswer")}</label>
      <textarea id={`w-${task.id}`} className="ex-writing" lang="en" spellCheck={false} value={text} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} rows={16} />
      <p className={`ex-wordcount ex-wc-${state}`} aria-live="polite">{t("exam.words", { n: String(n), lo: String(lo), hi: String(hi) })}</p>
    </article>
  );
}

const DESCRIPTORS: Record<Subscale, LocalizedText> = {
  content: { en: "5: everything relevant, the reader is fully informed. 3: minor irrelevances or omissions. 1: parts irrelevant or misunderstood; reader only minimally informed.", bg: "5: всичко е по темата и читателят е напълно информиран. 3: дребни отклонения или пропуски. 1: части са извън темата или задачата е разбрана погрешно." },
  communicative: { en: "Genre, format, register and purpose suit the task and hold the reader's attention (5: with ease and flexibility; 3: effectively; 1: adequately).", bg: "Жанрът, формата, регистърът и целта отговарят на задачата и задържат вниманието на читателя (5: лесно и гъвкаво; 3: ефективно; 1: достатъчно)." },
  organisation: { en: "A logical, coherent text with varied linking and paragraphing (5: a well-organised coherent whole; 3: well organised and coherent; 1: generally well organised).", bg: "Логичен, свързан текст с разнообразни свързващи думи и абзаци (5: добре организирано цяло; 3: добре организиран; 1: в общи линии организиран)." },
  language: { en: "Range and accuracy of vocabulary and grammar (5: precise, full control, rare slips; 3: appropriate, occasional errors that don't impede; 1: generally appropriate, good degree of control).", bg: "Обхват и точност на речника и граматиката (5: прецизно, пълен контрол, редки грешки; 3: подходящо, понякога грешки, които не пречат; 1: в общи линии подходящо)." },
};

/**
 * Writing assessment on the four official subscales. Automatic indicators count what can be counted;
 * the learner then sets each mark against the official descriptors and the model answer.
 */
export function WritingAssessment({ task, text, marks, onMarks }: { task: Writing; text: string; marks: Record<Subscale, number> | null; onMarks: (m: Record<Subscale, number>) => void }) {
  const { t, lang } = useProfile();
  const c = checkWriting(task, text);
  useEffect(() => {
    if (!marks) onMarks(c.indicator);
  }, [marks, c.indicator, onMarks]);
  const m = marks ?? c.indicator;
  return (
    <section className="card ex-assess" aria-labelledby={`wa-${task.id}`}>
      <h3 id={`wa-${task.id}`} className="section-title">{t("exam.writingCheck")}</h3>
      <p className="setting-hint">{t("exam.writingHonest")}</p>
      <ul className="ex-checks">
        <li data-ok={c.words >= c.range[0] && c.words <= c.range[1]}>{t("exam.words", { n: String(c.words), lo: String(c.range[0]), hi: String(c.range[1]) })}</li>
        {c.points.map((p) => <li key={p.label} data-ok={p.found}>{t(p.found ? "exam.pointYes" : "exam.pointNo", { point: p.label })}</li>)}
        <li data-ok={c.paragraphs >= 3}>{t("exam.paragraphs", { n: String(c.paragraphs) })}</li>
        <li data-ok={c.linkers.length >= 4}>{t("exam.linkers", { n: String(c.linkers.length) })}{c.linkers.length ? `: ${c.linkers.slice(0, 8).join(", ")}` : ""}</li>
        {c.conventions.map((x) => <li key={x.label} data-ok={x.ok}>{t(`exam.conv.${x.label}` as StringKey)}</li>)}
        {c.registerIssues.map((r) => <li key={r} data-ok={false}>{t("exam.register", { issue: r })}</li>)}
        <li data-ok={c.structures.length >= 3}>{t("exam.structures")}: {c.structures.join(", ") || "—"}</li>
        {c.repeated.length > 0 && <li data-ok={false}>{t("exam.repeated", { words: c.repeated.slice(0, 6).join(", ") })}</li>}
      </ul>
      <div className="ex-subscales">
        {SUBSCALES.map((s) => (
          <fieldset key={s} className="ex-subscale">
            <legend>{t(`exam.sub.${s}` as StringKey)} <span className="card-meta">{t("exam.indicator", { n: String(c.indicator[s]) })}</span></legend>
            <p className="setting-hint">{localize(DESCRIPTORS[s], lang)}</p>
            <div className="ex-scale" role="radiogroup" aria-label={t(`exam.sub.${s}` as StringKey)}>
              {[0, 1, 2, 3, 4, 5].map((v) => (
                <label key={v} className="ex-scale-opt" data-selected={m[s] === v}>
                  <input type="radio" name={`${task.id}-${s}`} checked={m[s] === v} onChange={() => onMarks({ ...m, [s]: v })} />
                  {v}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <p className="ex-total">{t("exam.writingTotal", { n: String(SUBSCALES.reduce((a, s) => a + m[s], 0)) })}</p>
      <details className="ex-model">
        <summary>{t("exam.model")}</summary>
        <div lang="en" className="ex-prose">{task.model.split(/\n\s*\n|\n/).map((p, i) => <p key={i}>{p}</p>)}</div>
        <p className="gram-body">{localize(task.modelNotes, lang)}</p>
      </details>
    </section>
  );
}

/* ───────────────────────── Speaking ───────────────────────── */

export const SPEAKING_CRITERIA: Record<"b2-first" | "c1-advanced", string[]> = {
  "b2-first": ["grammarVocabulary", "discourse", "pronunciation", "interaction", "global"],
  "c1-advanced": ["grammar", "lexis", "discourse", "pronunciation", "interaction", "global"],
};

export type SpeakingTurn = { line: number; ms: number; words: number | null };

/**
 * One Speaking part with a single learner: the examiner voice asks each question, the learner records
 * their answer (or answers aloud without recording), with the official turn length shown as a timer.
 */
export function SpeakingTaskView({ task, turns, onTurn }: { task: Speaking; turns: SpeakingTurn[]; onTurn: (t: SpeakingTurn) => void }) {
  const { t, lang } = useProfile();
  const [line, setLine] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    if (left === null || left <= 0) return;
    const id = window.setTimeout(() => setLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [left]);
  // Part 3 ends with the one-minute decision; every other turn uses the part's turn length.
  const secondsFor = (i: number) => (task.part === 3 && i === task.examiner.length - 1 && task.examiner.length > 2 ? 60 : task.turnSeconds);
  const ask = async (i: number) => {
    setLine(i);
    setLeft(null);
    await speak(task.examiner[i], { natural: EXAMINER_VOICE });
    setLeft(secondsFor(i));
  };
  const done = turns.some((x) => x.line === line);
  const next = () => {
    if (!done) onTurn({ line, ms: (secondsFor(line) - (left ?? secondsFor(line))) * 1000, words: null });
    if (line + 1 < task.examiner.length) void ask(line + 1);
    else setLeft(null);
  };
  const take = (tk: Take) => {
    onTurn({ line, ms: tk.ms, words: tk.transcript ? tk.transcript.split(/\s+/).length : null });
    setLeft(null);
  };
  return (
    <article className="ex-task" data-kind="speaking" data-task-id={task.id}>
      <header className="ex-task-head">
        <p className="card-meta">{t("exam.speakingPart", { part: String(task.part) })} · {t("exam.turnSeconds", { n: String(task.turnSeconds) })}</p>
        <p className="ex-instructions" lang="en">{task.instructions}</p>
      </header>
      {task.pictures && (
        <ul className="ex-pictures">{task.pictures.map((p) => <li key={p.letter} className="ex-picture"><strong>{p.letter}</strong> <span lang="en">{p.description}</span></li>)}</ul>
      )}
      {task.prompts && (
        <div className="ex-prompts" lang="en">
          {task.prompts.map((p) => <span key={p} className="ex-prompt-chip">{p}</span>)}
        </div>
      )}
      <ol className="ex-turns">
        {task.examiner.map((q, i) => (
          <li key={i} className="ex-turn" data-current={i === line} data-done={turns.some((x) => x.line === i)}>
            <span className="ex-examiner" lang="en">{i <= line || turns.some((x) => x.line === i) ? q : "…"}</span>
          </li>
        ))}
      </ol>
      <div className="ex-turn-actions">
        <button type="button" className="btn btn-primary btn-small" onClick={() => ask(line)}>{t("exam.askQuestion")}</button>
        {left !== null && <span className="ex-countdown" role="timer" aria-live="off">{left}s</span>}
        <button type="button" className="btn btn-quiet btn-small" onClick={next}>{line + 1 < task.examiner.length ? t("exam.nextQuestion") : t("exam.finishPart")}</button>
      </div>
      <Recorder key={`${task.id}-${line}`} compact onTake={take} onSkip={next} maxSeconds={Math.max(30, task.turnSeconds + 10)} />
      <details className="ex-model">
        <summary>{t("exam.usefulLanguage")}</summary>
        <ul className="ex-useful" lang="en">{task.usefulLanguage.map((u) => <li key={u}>{u}</li>)}</ul>
      </details>
      <details className="ex-model">
        <summary>{t("exam.sample")}</summary>
        <p lang="en" className="ex-prose">{task.sample}</p>
        <p className="setting-hint">{localize({ en: "An original sample answer for one turn.", bg: "Примерен отговор за един ход (оригинален)." }, lang)}</p>
      </details>
    </article>
  );
}

/** Self-assessment on the official Speaking criteria (0–5 each). Not an examiner's mark. */
export function SpeakingAssessment({ exam, marks, onMarks }: { exam: "b2-first" | "c1-advanced"; marks: Record<string, number>; onMarks: (m: Record<string, number>) => void }) {
  const { t } = useProfile();
  return (
    <section className="card ex-assess">
      <h3 className="section-title">{t("exam.speakingCheck")}</h3>
      <p className="setting-hint">{t("exam.speakingHonest")}</p>
      {SPEAKING_CRITERIA[exam].map((c) => (
        <fieldset key={c} className="ex-subscale">
          <legend>{t(`exam.crit.${c}` as StringKey)}</legend>
          <p className="setting-hint">{t(`exam.critHint.${c}` as StringKey)}</p>
          <div className="ex-scale" role="radiogroup" aria-label={t(`exam.crit.${c}` as StringKey)}>
            {[0, 1, 2, 3, 4, 5].map((v) => (
              <label key={v} className="ex-scale-opt" data-selected={marks[c] === v}>
                <input type="radio" name={`sp-${c}`} checked={marks[c] === v} onChange={() => onMarks({ ...marks, [c]: v })} />
                {v}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </section>
  );
}
