import { useEffect, useState, type ReactNode } from "react";
import { localize, type LocalizedText } from "../../content/schema";
import type { ExamTask } from "../../content/exams/schema";
import { partSpec } from "../../content/exams/spec";
import type { QuestionResult } from "../../engine/exam/scoring";
import { recordings, type Recording } from "../../engine/exam/audio";
import { speak, stopSpeaking } from "../../lib/speech";
import { useProfile } from "../../state/profile";
import { LensText } from "../../components/lens/Lens";

export type TaskViewProps = {
  task: ExamTask;
  answers: Record<string, string>;
  onAnswer: (n: number, value: string) => void;
  /** After submitting: per-question results; inputs become read-only and keys/explanations show. */
  review?: QuestionResult[];
  /** Exam conditions: each recording can be played twice, like the real Listening test. */
  examConditions?: boolean;
};

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** Text with {{n}} gaps rendered by `gap(n)`; blank lines start new paragraphs. */
function GappedProse({ text, gap }: { text: string; gap: (n: number) => ReactNode }) {
  return (
    <div className="ex-prose" lang="en">
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i}>
          {para.split(/(\{\{\d+\}\})/).map((bit, k) => {
            const m = bit.match(/^\{\{(\d+)\}\}$/);
            return m ? <span key={k}>{gap(Number(m[1]))}</span> : <span key={k}>{bit}</span>;
          })}
        </p>
      ))}
    </div>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <div className="ex-prose" lang="en">
      {text.split(/\n\s*\n/).map((p, i) => <p key={i}><LensText text={p} /></p>)}
    </div>
  );
}

function Feedback({ r, why }: { r?: QuestionResult; why?: LocalizedText }) {
  const { t, lang } = useProfile();
  if (!r) return null;
  return (
    <div className={`ex-fb ${r.correct ? "ex-fb-right" : r.marks > 0 ? "ex-fb-part" : "ex-fb-wrong"}`} role="note">
      <p className="ex-fb-head">
        <span className="ex-fb-mark">{r.marks}/{r.max}</span>{" "}
        {!r.correct && <>{t("exam.key")}: <strong lang="en">{r.key}</strong></>}
        {r.correct && t("session.correct")}
      </p>
      {why && <p className="ex-fb-why">{localize(why, lang)}</p>}
    </div>
  );
}

/** Play a recording line by line in its speakers' voices. In exam conditions, at most twice. */
function Player({ rec, examConditions }: { rec: Recording; examConditions?: boolean }) {
  const { t } = useProfile();
  const [plays, setPlays] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<"normal" | "slow">("normal");
  useEffect(() => () => stopSpeaking(), []);
  const limit = examConditions ? 2 : Infinity;
  const play = async () => {
    if (playing || plays >= limit) return;
    setPlays((p) => p + 1);
    setPlaying(true);
    for (const line of rec.lines) {
      const ok = await speak(line.text, { natural: line.voice, speed, cancel: false });
      if (!ok) break;
    }
    setPlaying(false);
  };
  return (
    <div className="ex-player">
      {playing ? (
        <button type="button" className="btn btn-quiet btn-small" onClick={() => { stopSpeaking(); setPlaying(false); }}>{t("exam.stop")}</button>
      ) : (
        <button type="button" className="btn btn-primary btn-small" onClick={play} disabled={plays >= limit}>
          {plays === 0 ? t("exam.play") : t("exam.playAgain")}
        </button>
      )}
      {examConditions ? (
        <span className="card-meta">{t("exam.playsLeft", { n: String(Math.max(0, limit - plays)) })}</span>
      ) : (
        <span className="speed" role="group" aria-label={t("speak.speed")}>
          {(["slow", "normal"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{t(`speak.${s}`)}</button>
          ))}
        </span>
      )}
      {playing && <span className="ex-playing" aria-live="polite">{t("exam.playing")}</span>}
    </div>
  );
}

function Transcript({ rec }: { rec: Recording }) {
  const { t } = useProfile();
  return (
    <details className="ex-transcript">
      <summary>{t("exam.transcript")}</summary>
      <div lang="en">{rec.lines.map((l, i) => <p key={i}>{l.speaker && rec.lines.some((x) => x.speaker !== l.speaker) ? <strong>{l.speaker}: </strong> : null}<LensText text={l.text} /></p>)}</div>
    </details>
  );
}

/** A radio group of options; value = option index (as text) or letter. */
function Choices({ name, options, value, onChange, disabled, letters = false, label }: { name: string; options: string[]; value?: string; onChange: (v: string) => void; disabled?: boolean; letters?: boolean; label: string }) {
  return (
    <div className="ex-choices" role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const v = letters ? o : String(i);
        return (
          <label key={i} className="choice ex-choice" data-selected={value === v}>
            <input type="radio" name={name} checked={value === v} disabled={disabled} onChange={() => onChange(v)} />
            {!letters && <span className="ex-letter">{LETTERS[i]}</span>}
            <span lang="en">{o}</span>
          </label>
        );
      })}
    </div>
  );
}

export function TaskView({ task, answers, onAnswer, review, examConditions }: TaskViewProps) {
  const { t } = useProfile();
  const spec = partSpec(task.exam, task.paper, task.part)!;
  const ro = !!review;
  const res = (n: number) => review?.find((r) => r.n === n);
  const qLabel = (n: number) => t("exam.question", { n: String(n) });
  const input = (n: number, size = 12) => (
    <input
      className={`ex-gap ${res(n) ? (res(n)!.correct ? "is-right" : "is-wrong") : ""}`}
      aria-label={qLabel(n)}
      value={answers[n] ?? ""}
      readOnly={ro}
      size={size}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      onChange={(e) => onAnswer(n, e.target.value)}
    />
  );
  const gapNo = (n: number) => <sup className="ex-gapno">{n}</sup>;

  let body: ReactNode = null;
  switch (task.kind) {
    case "mc-cloze":
      body = (
        <>
          <GappedProse
            text={task.text}
            gap={(n) => {
              const q = task.questions.find((x) => x.n === n)!;
              return (
                <>
                  {gapNo(n)}
                  <select className={`ex-gap ex-select ${res(n) ? (res(n)!.correct ? "is-right" : "is-wrong") : ""}`} aria-label={qLabel(n)} value={answers[n] ?? ""} disabled={ro} onChange={(e) => onAnswer(n, e.target.value)}>
                    <option value="">…</option>
                    {q.options.map((o, i) => <option key={i} value={String(i)}>{LETTERS[i]} {o}</option>)}
                  </select>
                </>
              );
            }}
          />
          {review && task.questions.map((q) => <div key={q.n} className="ex-q"><span className="ex-qn">{q.n}</span><Feedback r={res(q.n)} why={q.why} /></div>)}
        </>
      );
      break;
    case "open-cloze":
    case "word-formation":
      body = (
        <>
          <GappedProse text={task.text} gap={(n) => <>{gapNo(n)}{input(n)}</>} />
          {review && task.questions.map((q) => <div key={q.n} className="ex-q"><span className="ex-qn">{q.n}</span><Feedback r={res(q.n)} why={q.why} /></div>)}
        </>
      );
      break;
    case "kwt":
      body = (
        <ol className="ex-list">
          {task.questions.map((q) => (
            <li key={q.n} className="ex-q ex-kwt">
              <span className="ex-qn">{q.n}</span>
              <div>
                <p lang="en">{q.first}</p>
                <p className="ex-keyword" lang="en">{q.keyword}</p>
                <p lang="en">{q.before} {input(q.n, 28)} {q.after}</p>
                <Feedback r={res(q.n)} why={q.why} />
              </div>
            </li>
          ))}
        </ol>
      );
      break;
    case "reading-mc":
      body = (
        <div className="ex-split">
          <div className="ex-text-pane"><Prose text={task.text} /></div>
          <ol className="ex-list">
            {task.questions.map((q) => (
              <li key={q.n} className="ex-q">
                <span className="ex-qn">{q.n}</span>
                <div>
                  <p className="ex-stem" lang="en">{q.question}</p>
                  <Choices name={`${task.id}-${q.n}`} label={qLabel(q.n)} options={q.options} value={answers[q.n]} disabled={ro} onChange={(v) => onAnswer(q.n, v)} />
                  <Feedback r={res(q.n)} why={q.why} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      );
      break;
    case "cross-text":
      body = (
        <div className="ex-split">
          <div className="ex-text-pane">
            {task.texts.map((x) => (
              <section key={x.letter} className="ex-section">
                <h3 className="ex-section-title">{x.letter} <span className="card-meta">{x.author}</span></h3>
                <Prose text={x.text} />
              </section>
            ))}
          </div>
          <ol className="ex-list">
            {task.questions.map((q) => (
              <li key={q.n} className="ex-q">
                <span className="ex-qn">{q.n}</span>
                <div>
                  <p className="ex-stem" lang="en">{q.question}</p>
                  <Choices name={`${task.id}-${q.n}`} label={qLabel(q.n)} letters options={task.texts.map((x) => x.letter)} value={answers[q.n]} disabled={ro} onChange={(v) => onAnswer(q.n, v)} />
                  <Feedback r={res(q.n)} why={q.why} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      );
      break;
    case "gapped-text":
      body = (
        <div className="ex-split">
          <div className="ex-text-pane">
            <GappedProse
              text={task.text}
              gap={(n) => (
                <span className="ex-gt-gap">
                  {gapNo(n)}
                  <select className={`ex-gap ex-select ${res(n) ? (res(n)!.correct ? "is-right" : "is-wrong") : ""}`} aria-label={qLabel(n)} value={answers[n] ?? ""} disabled={ro} onChange={(e) => onAnswer(n, e.target.value)}>
                    <option value="">…</option>
                    {task.options.map((o) => <option key={o.letter} value={o.letter}>{o.letter}</option>)}
                  </select>
                </span>
              )}
            />
          </div>
          <div>
            <ul className="ex-options">{task.options.map((o) => <li key={o.letter}><strong>{o.letter}</strong> <span lang="en">{o.text}</span></li>)}</ul>
            {review && task.questions.map((q) => <div key={q.n} className="ex-q"><span className="ex-qn">{q.n}</span><Feedback r={res(q.n)} why={q.why} /></div>)}
          </div>
        </div>
      );
      break;
    case "matching":
      body = (
        <div className="ex-split">
          <div className="ex-text-pane">
            {task.sections.map((s) => (
              <section key={s.letter} className="ex-section">
                <h3 className="ex-section-title">{s.letter} {s.heading}</h3>
                <Prose text={s.text} />
              </section>
            ))}
          </div>
          <ol className="ex-list">
            {task.questions.map((q) => (
              <li key={q.n} className="ex-q">
                <span className="ex-qn">{q.n}</span>
                <div>
                  <p className="ex-stem" lang="en">{q.statement}</p>
                  <Choices name={`${task.id}-${q.n}`} label={qLabel(q.n)} letters options={task.sections.map((s) => s.letter)} value={answers[q.n]} disabled={ro} onChange={(v) => onAnswer(q.n, v)} />
                  <Feedback r={res(q.n)} why={q.why} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      );
      break;
    case "listen-mc": {
      const recs = recordings(task);
      body = (
        <ol className="ex-list">
          {task.extracts.map((e, i) => (
            <li key={i} className="ex-extract">
              <p className="ex-context" lang="en">{e.context}</p>
              <Player rec={recs[i]} examConditions={examConditions} />
              {e.questions.map((q) => (
                <div key={q.n} className="ex-q">
                  <span className="ex-qn">{q.n}</span>
                  <div>
                    <p className="ex-stem" lang="en">{q.question}</p>
                    <Choices name={`${task.id}-${q.n}`} label={qLabel(q.n)} options={q.options} value={answers[q.n]} disabled={ro} onChange={(v) => onAnswer(q.n, v)} />
                    <Feedback r={res(q.n)} why={q.why} />
                  </div>
                </div>
              ))}
              {review && <Transcript rec={recs[i]} />}
            </li>
          ))}
        </ol>
      );
      break;
    }
    case "listen-sentence": {
      const [rec] = recordings(task);
      body = (
        <>
          <p className="ex-context" lang="en">{task.context}</p>
          <Player rec={rec} examConditions={examConditions} />
          <ol className="ex-list">
            {task.questions.map((q) => {
              const [a, b] = q.sentence.split("___");
              return (
                <li key={q.n} className="ex-q">
                  <span className="ex-qn">{q.n}</span>
                  <div>
                    <p lang="en">{a}{input(q.n, 16)}{b}</p>
                    <Feedback r={res(q.n)} why={q.why} />
                  </div>
                </li>
              );
            })}
          </ol>
          {review && <Transcript rec={rec} />}
        </>
      );
      break;
    }
    case "listen-matching": {
      const recs = recordings(task);
      body = (
        <>
          <p className="ex-context" lang="en">{task.context}</p>
          <div className="ex-speakers">
            {recs.map((r, i) => (
              <div key={r.key} className="ex-speaker">
                <span className="ex-section-title">{t("exam.speaker", { n: String(i + 1) })}</span>
                <Player rec={r} examConditions={examConditions} />
              </div>
            ))}
          </div>
          {task.tasks.map((x, k) => (
            <section key={k} className="ex-section">
              <h3 className="ex-section-title" lang="en">{x.prompt}</h3>
              <ul className="ex-options">{x.options.map((o) => <li key={o.letter}><strong>{o.letter}</strong> <span lang="en">{o.text}</span></li>)}</ul>
              <ol className="ex-list">
                {x.questions.map((q, i) => (
                  <li key={q.n} className="ex-q">
                    <span className="ex-qn">{q.n}</span>
                    <div>
                      <p className="ex-stem">{t("exam.speaker", { n: String(i + 1) })}</p>
                      <Choices name={`${task.id}-${q.n}`} label={qLabel(q.n)} letters options={x.options.map((o) => o.letter)} value={answers[q.n]} disabled={ro} onChange={(v) => onAnswer(q.n, v)} />
                      <Feedback r={res(q.n)} why={q.why} />
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {review && recs.map((r) => <Transcript key={r.key} rec={r} />)}
        </>
      );
      break;
    }
    default:
      body = null;
  }

  return (
    <article className="ex-task" data-kind={task.kind} data-task-id={task.id}>
      <header className="ex-task-head">
        <p className="card-meta">{t("exam.partOf", { part: String(task.part), name: spec.name })} · {t("exam.questions", { from: String(spec.from), to: String(spec.to) })}</p>
        <p className="ex-instructions" lang="en">{task.instructions}</p>
      </header>
      {body}
    </article>
  );
}
