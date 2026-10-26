import { ContentPack, BANDS, type ContentPack as Pack, type Band } from "./schema";
import { SUPPORTED_LANGUAGES } from "../i18n/strings";

/** Lowercased word tokens, keeping internal apostrophes (I'm, don't) and hyphens. Names (capitalised mid-sentence) are skipped. */
export function tokenizeWords(line: string): string[] {
  const out: string[] = [];
  const re = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
  for (const m of line.matchAll(re)) {
    const raw = m[0].replace(/’/g, "'");
    const atStart = m.index === 0 || /[.!?]\s*$/.test(line.slice(0, m.index));
    if (/^[A-Z][a-z]/.test(raw) && !atStart && raw !== "I") continue; // proper noun
    out.push(raw.toLowerCase());
  }
  return out;
}

export type Issue ={ level: "error" | "warning"; where: string; message: string };

const bandIndex = (b: Band) => BANDS.indexOf(b);

/** Validates packs individually (schema) and together (references, duplicates, graph, translations). */
export function validatePacks(raw: Array<{ file: string; data: unknown }>): { packs: Pack[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const packs: Pack[] = [];

  for (const { file, data } of raw) {
    const parsed = ContentPack.safeParse(data);
    if (!parsed.success) {
      for (const e of parsed.error.issues) {
        issues.push({ level: "error", where: `${file}:${e.path.join(".")}`, message: e.message });
      }
      continue;
    }
    packs.push(parsed.data);
  }

  const competences = new Map<string, { band: Band; prerequisites: string[] }>();
  const itemIds = new Set<string>();
  const prompts = new Map<string, string>();

  for (const pack of packs) {
    for (const c of pack.competences) {
      if (competences.has(c.id)) issues.push({ level: "error", where: c.id, message: "duplicate competence id" });
      competences.set(c.id, { band: c.band, prerequisites: c.prerequisites });
    }
  }

  for (const pack of packs) {
    for (const c of pack.competences) {
      for (const p of c.prerequisites) {
        const pre = competences.get(p);
        if (!pre) issues.push({ level: "error", where: c.id, message: `unknown prerequisite ${p}` });
        else if (bandIndex(pre.band) > bandIndex(c.band))
          issues.push({ level: "error", where: c.id, message: `prerequisite ${p} is at a higher band (${pre.band})` });
      }
    }
    for (const item of pack.items) {
      if (itemIds.has(item.id)) issues.push({ level: "error", where: item.id, message: "duplicate item id" });
      itemIds.add(item.id);

      const comp = competences.get(item.competence);
      if (!comp) issues.push({ level: "error", where: item.id, message: `unknown competence ${item.competence}` });
      else if (comp.band !== item.band)
        issues.push({ level: "warning", where: item.id, message: `item band ${item.band} differs from competence band ${comp.band}` });

      const key =
        item.type === "cloze" || item.type === "fix" ? item.sentence
        : item.type === "choice" || item.type === "speak" ? `${item.type}:${item.prompt}`
        : item.type === "build" ? item.tiles.join(" ")
        : item.type === "listen" ? `${item.audio}|${item.question}`
        : `${item.id}`;
      const seen = prompts.get(key.toLowerCase());
      if (seen) issues.push({ level: "error", where: item.id, message: `duplicate prompt (also in ${seen})` });
      prompts.set(key.toLowerCase(), item.id);

      if (item.review.status === "draft")
        issues.push({ level: "warning", where: item.id, message: "not yet reviewed" });

      for (const lang of SUPPORTED_LANGUAGES) {
        if (lang === "en") continue;
        if (!(lang in item.explanation))
          issues.push({ level: "warning", where: item.id, message: `explanation missing ${lang} translation` });
      }
    }
  }

  // Notes, texts, glossary.
  const textIds = new Set<string>();
  const glossaryKeys = new Set<string>();
  const known = new Set<string>();
  for (const pack of packs) {
    for (const n of pack.notes) {
      if (!competences.has(n.competence)) issues.push({ level: "error", where: n.id, message: `unknown competence ${n.competence}` });
      for (const lang of SUPPORTED_LANGUAGES)
        if (lang !== "en" && !(lang in n.body)) issues.push({ level: "warning", where: n.id, message: `note body missing ${lang} translation` });
    }
    for (const t of pack.texts) {
      if (textIds.has(t.id)) issues.push({ level: "error", where: t.id, message: "duplicate text id" });
      textIds.add(t.id);
      if (!competences.has(t.competence)) issues.push({ level: "error", where: t.id, message: `unknown competence ${t.competence}` });
    }
    for (const g of pack.glossary) {
      const key = `${g.word.toLowerCase()}|${g.pos}`;
      if (glossaryKeys.has(key)) issues.push({ level: "error", where: `glossary:${g.word}`, message: `duplicate glossary entry (${g.pos})` });
      glossaryKeys.add(key);
      for (const f of [g.word, ...g.forms]) known.add(f.toLowerCase());
      for (const lang of SUPPORTED_LANGUAGES)
        if (lang !== "en" && !(lang in g.meaning)) issues.push({ level: "warning", where: `glossary:${g.word}`, message: `meaning missing ${lang} translation` });
    }
  }
  for (const pack of packs) {
    for (const item of pack.items) {
      if (item.textId && !textIds.has(item.textId)) issues.push({ level: "error", where: item.id, message: `unknown text ${item.textId}` });
    }
    // Word Lens coverage: every word a learner can tap in texts, notes and sentences should have an entry.
    const tappable = [
      ...pack.texts.flatMap((t) => t.paragraphs),
      ...pack.notes.flatMap((n) => n.examples),
      ...pack.glossary.map((g) => g.example),
    ];
    const names = new Set(pack.names.map((n) => n.toLowerCase()));
    const missing = new Set<string>();
    for (const line of tappable) for (const w of tokenizeWords(line)) if (!known.has(w) && !names.has(w)) missing.add(w);
    if (missing.size)
      issues.push({ level: "warning", where: `${pack.id}:glossary`, message: `no Word Lens entry for: ${[...missing].sort().join(", ")}` });
  }

  // Prerequisite cycles.
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, trail: string[]) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      issues.push({ level: "error", where: id, message: `prerequisite cycle: ${[...trail, id].join(" → ")}` });
      return;
    }
    state.set(id, "visiting");
    for (const p of competences.get(id)?.prerequisites ?? []) if (competences.has(p)) visit(p, [...trail, id]);
    state.set(id, "done");
  };
  for (const id of competences.keys()) visit(id, []);

  return { packs, issues };
}
