import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Rating } from "ts-fsrs";
import { library } from "../../content/library";
import { localize, type Band, type GlossaryEntry } from "../../content/schema";
import { ALPHABET } from "../../content/alphabet";
import { CEFR_LEVELS } from "../../content/cefr";
import { db, type StudyCard } from "../../db/db";
import { cardState, type WordState } from "../../engine/dashboard";
import { gradeWord, removeWord, saveWord, competenceProgress } from "../../engine/progress";
import { award, XP } from "../../engine/xp";
import { EXPRESSIONS, expressionEntry, type ExprCategory, type Expression } from "../../content/expressions";
import { modelAnswer, seededShuffle } from "../../engine/check";
import { LensText } from "../../components/lens/Lens";
import { speak } from "../../lib/speech";
import { relativeDay } from "../../lib/time";
import { useProfile } from "../../state/profile";
import { topicName } from "../../i18n/topics";
import type { StringKey } from "../../i18n/strings";
import "../words.css";
import "./library.css";

const BANDS: Band[] = ["preA1", "A1", "A2", "B1", "B2", "C1", "C2"];
const bandLabel = (b: string) => (b === "preA1" ? "Pre-A1" : b);
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/** Unique glossary entries (the lens map has one key per word form). */
function entries(): GlossaryEntry[] {
  return [...new Set(library.lens.values())];
}

/** Multi-word entries (phrases, phrasal verbs, collocations) belong in Expressions. */
const isExpression = (e: GlossaryEntry) => e.pos === "phrase" || /\s/.test(e.word.trim());

function Sub({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  const { t } = useProfile();
  return (
    <div className="page lib">
      <Link className="lib-back" to="/library">← {t("lib.back")}</Link>
      <h1 className="page-title">{title}</h1>
      {lead && <p className="page-lead">{lead}</p>}
      {children}
    </div>
  );
}

/* ───────────────────────── Library home + search ───────────────────────── */

type Hit = { kind: "word" | "phrase" | "grammar" | "text" | "lesson"; key: string; title: string; detail: string; to?: string; entry?: GlossaryEntry };

export function LibraryHome() {
  const { t, lang } = useProfile();
  const [q, setQ] = useState("");
  const counts = useLiveQuery(async () => {
    const cards = await db.cards.where("kind").equals("word").toArray();
    const now = Date.now();
    const open = new Set((await db.mistakes.toArray()).filter((m) => !m.resolved).map((m) => m.itemId)).size;
    return { words: cards.length, due: cards.filter((c) => c.fsrs.due.getTime() <= now).length, open };
  }, []);
  const all = useMemo(() => entries(), []);
  const phrases = new Set([...EXPRESSIONS.map((e) => e.text.toLowerCase()), ...all.filter(isExpression).map((e) => e.word.toLowerCase())]).size;
  const listens = [...library.item.values()].filter((i) => i.type === "listen" || i.type === "dialogue").length;

  const hits = useMemo<Hit[]>(() => {
    const n = fold(q.trim());
    if (n.length < 2) return [];
    const out: Hit[] = [];
    for (const e of all) {
      if (fold(e.word).includes(n) || fold(localize(e.meaning, lang)).includes(n) || e.forms.some((f) => fold(f) === n))
        out.push({ kind: isExpression(e) ? "phrase" : "word", key: `w:${e.word}|${e.pos}`, title: e.word, detail: localize(e.meaning, lang), entry: e });
    }
    for (const e of EXPRESSIONS) {
      if (out.some((h) => h.title.toLowerCase() === e.text.toLowerCase())) continue;
      if (fold(e.text).includes(n) || fold(localize(e.meaning, lang)).includes(n))
        out.push({ kind: "phrase", key: `x:${e.text}`, title: e.text, detail: localize(e.meaning, lang), to: "/library/expressions" });
    }
    for (const note of library.note.values()) {
      if (fold(localize(note.title, lang)).includes(n) || fold(localize(note.body, lang)).includes(n) || note.examples.some((x) => fold(x).includes(n)))
        out.push({ kind: "grammar", key: `n:${note.id}`, title: localize(note.title, lang), detail: bandLabel(library.competence.get(note.competence)?.band ?? ""), to: `/library/grammar#${note.id}` });
    }
    for (const text of library.text.values()) {
      if (fold(text.title).includes(n) || text.paragraphs.some((p) => fold(p).includes(n)))
        out.push({ kind: "text", key: `t:${text.id}`, title: text.title, detail: bandLabel(text.band), to: `/library/reading#${text.id}` });
    }
    for (const c of library.competences) {
      if (fold(localize(c.title, lang)).includes(n) || fold(localize(c.canDo, lang)).includes(n))
        out.push({ kind: "lesson", key: `c:${c.id}`, title: localize(c.title, lang), detail: localize(c.canDo, lang), to: `/library/grammar#${c.id}` });
    }
    const rank = (h: Hit) => (fold(h.title) === n ? 0 : fold(h.title).startsWith(n) ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title)).slice(0, 40);
  }, [q, all, lang]);

  const sections: { to: string; title: StringKey; meta: string }[] = [
    { to: "/library/words", title: "lib.words", meta: t("lib.wordsMeta", { n: String(counts?.words ?? 0), due: String(counts?.due ?? 0) }) },
    { to: "/library/mistakes", title: "lib.mistakes", meta: t("lib.mistakesMeta", { n: String(counts?.open ?? 0) }) },
    { to: "/library/grammar", title: "lib.grammar", meta: t("lib.grammarMeta", { n: String(library.note.size) }) },
    { to: "/library/expressions", title: "lib.expressions", meta: t("lib.expressionsMeta", { n: String(phrases) }) },
    { to: "/library/reading", title: "lib.reading", meta: t("lib.readingMeta", { n: String(library.text.size + listens) }) },
    { to: "/library/alphabet", title: "lib.alphabet", meta: t("lib.alphabetMeta") },
    { to: "/library/cefr", title: "lib.cefr", meta: t("lib.cefrMeta") },
  ];

  return (
    <div className="page lib">
      <h1 className="page-title">{t("lib.title")}</h1>
      <p className="page-lead">{t("lib.lead")}</p>
      <div className="lib-search">
        <label htmlFor="lib-q" className="sr-only">{t("lib.searchLabel")}</label>
        <input id="lib-q" type="search" className="input" placeholder={t("lib.search")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" spellCheck={false} />
      </div>
      {q.trim().length >= 2 ? (
        <section aria-live="polite">
          <p className="card-meta">{hits.length ? t("lib.results", { n: String(hits.length) }) : t("lib.noResults", { q: q.trim() })}</p>
          <ul className="hit-list">
            {hits.map((h) => (
              <li key={h.key} className="hit">
                <span className="hit-kind">{t(`search.${h.kind}` as StringKey)}</span>
                <div className="hit-body">
                  {h.entry ? <LensText text={h.entry.word} className="hit-title" /> : <Link className="hit-title" to={h.to!}>{h.title}</Link>}
                  <p className="hit-detail">{h.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <ul className="lib-grid">
          {sections.map((s) => (
            <li key={s.to}>
              <Link className="lib-tile" to={s.to}>
                <span className="lib-tile-title">{t(s.title)}</span>
                <span className="card-meta">{s.meta}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── My vocabulary ───────────────────────── */

type Sort = "recent" | "due" | "az";
const STATES: WordState[] = ["new", "learning", "reviewing", "strong", "mastered"];

export function LibraryWords() {
  const { t, lang } = useProfile();
  const [filter, setFilter] = useState<WordState | "all">("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const data = useLiveQuery(async () => {
    const cards = await db.cards.where("kind").equals("word").toArray();
    const logs = await db.reviews.where("cardId").anyOf(cards.map((c) => c.id)).toArray();
    return { cards, logs, now: Date.now() };
  }, []);
  if (!data) return <div className="page" aria-busy="true" />;
  const now = data.now;
  const rows = data.cards
    .map((card) => ({ card, entry: library.lens.get(card.ref.split("|")[0].toLowerCase()), state: cardState(card) }))
    .filter((r) => r.entry);
  const count = (s: WordState) => rows.filter((r) => r.state === s).length;
  const shown = rows
    .filter((r) => filter === "all" || r.state === filter)
    .sort((a, b) =>
      sort === "az" ? a.entry!.word.localeCompare(b.entry!.word) : sort === "due" ? a.card.fsrs.due.getTime() - b.card.fsrs.due.getTime() : b.card.createdAt.localeCompare(a.card.createdAt),
    );
  const due = rows.filter((r) => r.card.fsrs.due.getTime() <= now).length;

  async function known(card: StudyCard) {
    // A self-report, recorded as an easy recall: the next check comes much later, but the word is
    // not "mastered" until it has been recalled several times over weeks.
    await gradeWord(card, Rating.Easy);
    setNotice(t("words.knownDone"));
  }

  return (
    <Sub title={t("lib.words")} lead={rows.length ? t("words.lead") : t("words.empty")}>
      {rows.length > 0 && (
        <>
          <div className="lib-toolbar">
            <div className="chip-row" role="group" aria-label={t("words.filter")}>
              {(["all", ...STATES] as const).map((s) => (
                <button key={s} type="button" className="chip" aria-pressed={filter === s} onClick={() => setFilter(s)}>
                  {t(`state.${s}` as StringKey)} <span className="chip-n">{s === "all" ? rows.length : count(s)}</span>
                </button>
              ))}
            </div>
            <label className="lib-sort">
              <span>{t("words.sort")}</span>
              <select className="input input-small" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">{t("words.sortRecent")}</option>
                <option value="due">{t("words.sortDue")}</option>
                <option value="az">{t("words.sortAZ")}</option>
              </select>
            </label>
          </div>
          {due > 0 && <Link className="btn btn-primary btn-small lib-cta" to="/review/session">{t("words.review")} ({due})</Link>}
          <p role="status" className="setting-hint">{notice}</p>
          <ul className="word-list">
            {shown.map(({ card, entry, state }) => {
              const history = data.logs.filter((l) => l.cardId === card.id).sort((a, b) => b.log.review.getTime() - a.log.review.getTime());
              const recalls = history.filter((h) => h.log.rating >= Rating.Good).length;
              const expanded = open === card.id;
              return (
                <li key={card.id} className="word-row lib-word">
                  <div className="lib-word-main">
                    <p className="word-row-head">
                      <LensText text={entry!.word} context={card.context} className="word-row-word" />
                      {entry!.ipa && <span className="word-row-ipa">{entry!.ipa}</span>}
                      <span className="state-pill" data-state={state}>{t(`state.${state}` as StringKey)}</span>
                    </p>
                    <p className="word-row-meaning">{localize(entry!.meaning, lang)}</p>
                    {card.context && <p className="word-row-context" lang="en">“{card.context}”</p>}
                    <p className="card-meta">
                      {t("review.nextDue", { when: relativeDay(card.fsrs.due, lang) })} · {t("words.recalls", { n: String(recalls) })}
                    </p>
                    <div className="lib-word-actions">
                      <button type="button" className="btn btn-quiet btn-small" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : card.id)}>{t("words.history")}</button>
                      {state !== "mastered" && state !== "strong" && <button type="button" className="btn btn-quiet btn-small" onClick={() => known(card)}>{t("words.known")}</button>}
                      <button type="button" className="btn btn-quiet btn-small" onClick={() => removeWord(entry!)}>{t("words.remove")}</button>
                    </div>
                    {expanded && (
                      history.length ? (
                        <ol className="history">
                          {history.map((h, i) => (
                            <li key={i}><span>{h.log.review.toLocaleDateString(lang === "bg" ? "bg-BG" : "en-GB")}</span> <span>{t(`grade.${h.log.rating}` as StringKey)}</span></li>
                          ))}
                        </ol>
                      ) : <p className="setting-hint">{t("words.noHistory")}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sub>
  );
}

/* ───────────────────────── Expressions ───────────────────────── */

export function LibraryExpressions() {
  const { t, lang, profile } = useProfile();
  const [cat, setCat] = useState<ExprCategory | "all">("all");
  const [notice, setNotice] = useState("");
  const saved = useLiveQuery(async () => new Set((await db.cards.where("kind").equals("word").toArray()).map((c) => c.id)), []);
  // Curated expressions, plus multi-word entries met in lessons that aren't already curated.
  const curated = new Set(EXPRESSIONS.map((e) => e.text.toLowerCase()));
  const fromLessons: Expression[] = entries()
    .filter((e) => isExpression(e) && !curated.has(e.word.toLowerCase()) && e.band !== "preA1")
    .map((e) => ({ text: e.word, band: e.band as Expression["band"], category: "everyday", register: "neutral", meaning: e.meaning, use: { en: "" }, example: e.example, related: [] }));
  const all = [...EXPRESSIONS, ...fromLessons];
  const shown = all.filter((e) => cat === "all" || e.category === cat);
  const cats = [...new Set(all.map((e) => e.category))];
  const voice = { voiceId: profile?.voiceId };

  return (
    <Sub title={t("lib.expressions")} lead={t("expr.lead")}>
      <div className="chip-row" role="group" aria-label={t("words.filter")}>
        {(["all", ...cats] as const).map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c === "all" ? t("expr.all") : t(`cat.${c}` as StringKey)}
          </button>
        ))}
      </div>
      <p role="status" className="setting-hint">{notice}</p>
      {BANDS.map((b) => {
        const group = shown.filter((e) => e.band === b);
        if (!group.length) return null;
        return (
          <section key={b} className="lib-group">
            <h2 className="section-title">{bandLabel(b)}</h2>
            <ul className="expr-list">
              {group.map((e) => {
                const id = `word:${e.text.toLowerCase()}|phrase`;
                const isSaved = saved?.has(id) || saved?.has(`word:${e.text.toLowerCase()}|${library.lens.get(e.text.toLowerCase())?.pos}`);
                const use = localize(e.use, lang);
                return (
                  <li key={e.text} className="card expr-card">
                    <div className="card-head">
                      <h3 className="expr-text" lang="en">{e.text}</h3>
                      <span className="card-meta">{t(`reg.${e.register}` as StringKey)} · {t(`cat.${e.category}` as StringKey)}</span>
                    </div>
                    <p>{localize(e.meaning, lang)}</p>
                    {use && <p className="gram-body"><strong>{t("expr.when")}:</strong> {use}</p>}
                    <p className="word-row-context"><LensText text={e.example} /></p>
                    {e.related.length > 0 && <p className="card-meta"><span>{t("expr.related")}:</span> <span lang="en">{e.related.join(" · ")}</span></p>}
                    <div className="lib-word-actions">
                      <button type="button" className="btn btn-quiet btn-small" onClick={() => speak(e.example, voice)}>{t("session.listen")}</button>
                      {isSaved ? (
                        <span className="state-pill" data-state="learning">{t("expr.saved")}</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-quiet btn-small"
                          onClick={async () => {
                            const entry = library.lens.get(e.text.toLowerCase()) ?? expressionEntry(e as Expression);
                            await saveWord(entry, e.example);
                            await award(`word:word:${entry.word.toLowerCase()}|${entry.pos}`, XP.word, "word");
                            setNotice(`${e.text} — ${t("expr.saved")}`);
                          }}
                        >
                          {t("expr.save")}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Sub>
  );
}

/* ───────────────────────── Grammar ───────────────────────── */

export function LibraryGrammar() {
  const { t, lang } = useProfile();
  const data = useLiveQuery(async () => {
    const [progress, mistakes] = await Promise.all([competenceProgress(), db.mistakes.toArray()]);
    return { progress, open: mistakes.filter((m) => !m.resolved) };
  }, []);
  if (!data) return <div className="page" aria-busy="true" />;
  return (
    <Sub title={t("lib.grammar")} lead={t("gram.lead")}>
      {BANDS.map((b) => {
        const comps = library.competences.filter((c) => c.band === b && (library.notesByCompetence.get(c.id)?.length ?? 0) > 0);
        if (!comps.length) return null;
        return (
          <section key={b} className="lib-group">
            <h2 className="section-title">{bandLabel(b)}</h2>
            {comps.map((c) => {
              const p = data.progress.get(c.id);
              const items = (library.itemsByCompetence.get(c.id) ?? []).filter((i) => !i.textId);
              const mistakes = new Set(data.open.filter((m) => m.competence === c.id).map((m) => m.itemId));
              const ids = seededShuffle(items, c.id).slice(0, 5).map((i) => i.id);
              return (
                <article key={c.id} id={c.id} className="card gram-card">
                  <div className="card-head">
                    <h3 className="gram-comp">{localize(c.title, lang)}</h3>
                    {p && <span className="card-meta">{t("gram.mastery", { done: String(p.answered), total: String(p.total) })}</span>}
                  </div>
                  {library.notesByCompetence.get(c.id)!.map((n) => (
                    <details key={n.id} id={n.id} className="gram-note" open={typeof location !== "undefined" && location.hash === `#${n.id}`}>
                      <summary>{localize(n.title, lang)}</summary>
                      <p className="gram-body">{localize(n.body, lang)}</p>
                      <ul className="gram-examples">{n.examples.map((x) => <li key={x}><LensText text={x} /></li>)}</ul>
                    </details>
                  ))}
                  <div className="lib-word-actions">
                    {ids.length > 0 && <Link className="btn btn-quiet btn-small" to={`/practice?ids=${ids.join(",")}`}>{t("gram.practise")}</Link>}
                    {mistakes.size > 0 && <Link className="btn btn-quiet btn-small" to={`/practice?ids=${[...mistakes].join(",")}`}>{t("gram.mistakes", { n: String(mistakes.size) })}</Link>}
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}
    </Sub>
  );
}

/* ───────────────────────── Alphabet ───────────────────────── */

export function LibraryAlphabet() {
  const { t, profile } = useProfile();
  const [sel, setSel] = useState(0);
  const [round, setRound] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const letter = ALPHABET[sel];

  const quizLetter = ALPHABET[seededShuffle(ALPHABET.map((_, i) => i), `abc-${round}`)[0]];
  const options = useMemo(() => {
    const others = seededShuffle(ALPHABET.filter((l) => l.upper !== quizLetter.upper), `o-${round}`).slice(0, 2).map((l) => l.examples[0]);
    return seededShuffle([quizLetter.examples[1], ...others], `s-${round}`);
  }, [round, quizLetter]);
  const voice = { voiceId: profile?.voiceId };

  return (
    <Sub title={t("lib.alphabet")} lead={t("abc.lead")}>
      <div className="abc-grid" role="group" aria-label={t("lib.alphabet")}>
        {ALPHABET.map((l, i) => (
          <button
            key={l.upper}
            type="button"
            className="abc-key"
            data-vowel={l.vowel}
            aria-pressed={sel === i}
            aria-label={`${l.upper}, ${l.vowel ? t("abc.vowel") : t("abc.consonant")}`}
            onClick={() => { setSel(i); speak(l.upper === "Z" ? "zee" : l.name, voice); }}
          >
            {l.upper}<span className="abc-lower">{l.upper.toLowerCase()}</span>
          </button>
        ))}
      </div>

      <section className="card abc-detail" aria-live="polite">
        <div className="card-head">
          <h2 className="abc-big" lang="en">{letter.upper}{letter.upper.toLowerCase()}</h2>
          <span className="card-meta">{letter.vowel ? t("abc.vowel") : t("abc.consonant")}</span>
        </div>
        <p><strong>{t("abc.name")}:</strong> <span lang="en">{letter.name}</span> <span className="word-row-ipa">{letter.ipa}</span></p>
        <h3 className="mini-title">{t("abc.sounds")}</h3>
        <ul className="abc-sounds">
          {letter.sounds.map((s) => (
            <li key={s.ipa + s.word}>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => speak(s.word, voice)}>▶ <span lang="en">{s.word}</span></button>
              <span className="word-row-ipa">{s.ipa}</span>
            </li>
          ))}
        </ul>
        <h3 className="mini-title">{t("abc.examples")}</h3>
        <p className="abc-examples">{letter.examples.map((w) => <LensText key={w} text={w} />).reduce<ReactNode[]>((a, x, i) => (i ? [...a, " · ", x] : [x]), [])}</p>
        <p className="setting-hint">{t("abc.note")}</p>
      </section>

      <section className="card" aria-labelledby="abc-quiz">
        <h2 id="abc-quiz" className="section-title">{t("abc.quiz")}</h2>
        <p>{t("abc.quizQ", { l: quizLetter.upper })}</p>
        <div className="chip-row">
          {options.map((o) => (
            <button key={o} type="button" className="chip" lang="en" aria-pressed={answer === o} onClick={() => setAnswer(o)}>{o}</button>
          ))}
        </div>
        <p role="status" className={answer ? (answer === quizLetter.examples[1] ? "abc-right" : "abc-wrong") : ""}>
          {answer && (answer === quizLetter.examples[1] ? t("abc.right") : t("abc.wrong"))}
        </p>
        {answer === quizLetter.examples[1] && (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => { setRound((r) => r + 1); setAnswer(null); }}>{t("session.continue")}</button>
        )}
      </section>
    </Sub>
  );
}

/* ───────────────────────── Mistake notebook ───────────────────────── */

type MisFilter = "open" | "frequent" | "recent" | "fixed";

export function LibraryMistakes() {
  const { t, lang } = useProfile();
  const [filter, setFilter] = useState<MisFilter>("open");
  const rows = useLiveQuery(() => db.mistakes.toArray(), []);
  if (!rows) return <div className="page" aria-busy="true" />;
  const groups = new Map<string, { itemId: string; times: number; last: string; given: string; open: boolean }>();
  for (const m of rows) {
    const g = groups.get(m.itemId) ?? { itemId: m.itemId, times: 0, last: "", given: "", open: false };
    g.times += 1;
    if (m.at > g.last) { g.last = m.at; g.given = m.given; }
    g.open ||= !m.resolved;
    groups.set(m.itemId, g);
  }
  const all = [...groups.values()].filter((g) => library.item.has(g.itemId));
  const list = (
    filter === "fixed" ? all.filter((g) => !g.open)
    : filter === "frequent" ? all.filter((g) => g.open).sort((a, b) => b.times - a.times)
    : filter === "recent" ? [...all].sort((a, b) => b.last.localeCompare(a.last))
    : all.filter((g) => g.open).sort((a, b) => b.last.localeCompare(a.last))
  );
  const openIds = all.filter((g) => g.open).map((g) => g.itemId);
  const tagCount = new Map<string, number>();
  for (const g of all.filter((x) => x.open)) for (const s of library.item.get(g.itemId)!.structures) tagCount.set(s, (tagCount.get(s) ?? 0) + g.times);
  const top = [...tagCount.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <Sub title={t("lib.mistakes")} lead={all.length ? t("mis.lead") : t("mis.empty")}>
      {all.length > 0 && (
        <>
          {top && <p className="mis-summary">{t("mis.summary", { topic: topicName(top[0], lang) })}</p>}
          <div className="lib-toolbar">
            <div className="chip-row" role="group">
              {(["open", "frequent", "recent", "fixed"] as const).map((f) => (
                <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`mis.filter.${f}`)}</button>
              ))}
            </div>
            {openIds.length > 0 && <Link className="btn btn-primary btn-small" to={`/practice?ids=${openIds.slice(0, 10).join(",")}`}>{t("practice.all", { n: String(Math.min(openIds.length, 10)) })}</Link>}
          </div>
          <ul className="mis-list">
            {list.map((g) => {
              const item = library.item.get(g.itemId)!;
              const comp = library.competence.get(item.competence);
              const prompt = "prompt" in item && typeof item.prompt === "string" ? item.prompt : "sentence" in item ? (item as { sentence: string }).sentence : "";
              return (
                <li key={g.itemId} className="card mis-card" data-open={g.open}>
                  <p className="card-meta">{comp ? `${localize(comp.title, lang)} · ${bandLabel(comp.band)}` : ""} · {t("mis.times", { n: String(g.times) })} · {t("mis.last", { when: relativeDay(new Date(g.last), lang) })}</p>
                  {prompt && <p className="mis-prompt" lang="en">{prompt}</p>}
                  <dl className="mis-answers">
                    <div><dt>{t("mis.you")}</dt><dd lang="en" className="mis-given">{g.given || "—"}</dd></div>
                    <div><dt>{t("mis.correct")}</dt><dd lang="en" className="mis-right">{modelAnswer(item)}</dd></div>
                  </dl>
                  <p className="gram-body">{localize(item.explanation, lang)}</p>
                  <div className="lib-word-actions">
                    <Link className="btn btn-quiet btn-small" to={`/practice?ids=${g.itemId}`}>{t("mis.practise")}</Link>
                    {library.notesByCompetence.get(item.competence)?.[0] && (
                      <Link className="btn btn-quiet btn-small" to={`/library/grammar#${library.notesByCompetence.get(item.competence)![0].id}`}>{t("mis.grammarLink")}</Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sub>
  );
}

/* ───────────────────────── Reading & listening ───────────────────────── */

export function LibraryReading() {
  const { t, lang } = useProfile();
  const recordings = [...library.item.values()].filter((i) => i.type === "listen" || i.type === "dialogue");
  return (
    <Sub title={t("lib.reading")} lead={t("read.lead")}>
      <h2 className="section-title">{t("read.texts")}</h2>
      {BANDS.map((b) => {
        const texts = [...library.text.values()].filter((x) => x.band === b);
        if (!texts.length) return null;
        return (
          <section key={b} className="lib-group">
            <h3 className="mini-title">{bandLabel(b)}</h3>
            {texts.map((x) => {
              const items = (library.itemsByCompetence.get(x.competence) ?? []).filter((i) => i.textId === x.id);
              return (
                <details key={x.id} id={x.id} className="card read-card" open={typeof location !== "undefined" && location.hash === `#${x.id}`}>
                  <summary className="read-title" lang="en">{x.title} <span className="card-meta">{t("read.items", { n: String(items.length) })}</span></summary>
                  <div className="read-body">
                    {x.paragraphs.map((p, i) => <p key={i}><LensText text={p} /></p>)}
                  </div>
                  <div className="lib-word-actions">
                    <button type="button" className="btn btn-quiet btn-small" onClick={() => speak(x.paragraphs.join(" "))}>{t("session.listen")}</button>
                    {items.length > 0 && <Link className="btn btn-quiet btn-small" to={`/practice?ids=${items.map((i) => i.id).join(",")}`}>{t("read.practise")}</Link>}
                  </div>
                </details>
              );
            })}
          </section>
        );
      })}
      {recordings.length > 0 && (
        <section className="lib-group">
          <h2 className="section-title">{t("read.recordings")}</h2>
          <ul className="word-list">
            {recordings.sort((a, b) => BANDS.indexOf(a.band) - BANDS.indexOf(b.band)).map((i) => (
              <li key={i.id} className="word-row">
                <div>
                  <p className="word-row-head"><span className="route-band">{bandLabel(i.band)}</span> {localize(library.competence.get(i.competence)?.title ?? { en: i.competence }, lang)}</p>
                  <p className="card-meta">{t(`skill.${i.skill}` as StringKey)}</p>
                </div>
                <Link className="btn btn-quiet btn-small" to={`/practice?ids=${i.id}`}>{t("read.open")}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sub>
  );
}

/* ───────────────────────── CEFR reference ───────────────────────── */

export function LibraryCefr() {
  const { t, lang, profile } = useProfile();
  const mine = profile?.acceptedBand ?? profile?.placedBand;
  return (
    <Sub title={t("lib.cefr")} lead={t("cefr.lead")}>
      <ol className="cefr-list">
        {CEFR_LEVELS.map((l) => (
          <li key={l.band} className="card cefr-card" aria-current={mine === l.band ? "true" : undefined}>
            <div className="card-head">
              <h2 className="cefr-band">{l.band} <span className="cefr-name">{localize(l.name, lang)}</span></h2>
              {mine === l.band && <span className="pill pill-good">{t("dash.level.chosen", { band: l.band })}</span>}
            </div>
            <p>{localize(l.summary, lang)}</p>
            <p className="card-meta">{localize(l.examples, lang)}</p>
          </li>
        ))}
      </ol>
      <Link className="btn btn-quiet btn-small" to="/placement">{t("dash.retest")}</Link>
    </Sub>
  );
}
