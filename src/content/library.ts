import { BANDS, ContentPack, type Band, type Competence, type GlossaryEntry, type Item, type Note, type Text } from "./schema";

/** All shipped packs, bundled at build time and validated again at load. */
const modules = import.meta.glob("./packs/*.json", { eager: true, import: "default" });

export type Library = {
  competences: Competence[];
  competence: Map<string, Competence>;
  itemsByCompetence: Map<string, Item[]>;
  item: Map<string, Item>;
  notesByCompetence: Map<string, Note[]>;
  note: Map<string, Note>;
  textsByCompetence: Map<string, Text[]>;
  text: Map<string, Text>;
  /** word form (lowercase) → entry */
  lens: Map<string, GlossaryEntry>;
  names: Set<string>;
};

export function buildLibrary(rawPacks: unknown[]): Library {
  const packs = rawPacks.map((p) => ContentPack.parse(p));
  const lib: Library = {
    competences: [],
    competence: new Map(),
    itemsByCompetence: new Map(),
    item: new Map(),
    notesByCompetence: new Map(),
    note: new Map(),
    textsByCompetence: new Map(),
    text: new Map(),
    lens: new Map(),
    names: new Set(),
  };
  const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => m.set(k, [...(m.get(k) ?? []), v]);

  for (const pack of packs) {
    for (const c of pack.competences) {
      lib.competences.push(c);
      lib.competence.set(c.id, c);
    }
    for (const i of pack.items) {
      lib.item.set(i.id, i);
      push(lib.itemsByCompetence, i.competence, i);
    }
    for (const n of pack.notes) {
      lib.note.set(n.id, n);
      push(lib.notesByCompetence, n.competence, n);
    }
    for (const t of pack.texts) {
      lib.text.set(t.id, t);
      push(lib.textsByCompetence, t.competence, t);
    }
    for (const g of pack.glossary) for (const f of [g.word, ...g.forms]) if (!lib.lens.has(f.toLowerCase())) lib.lens.set(f.toLowerCase(), g);
    for (const n of pack.names) lib.names.add(n.toLowerCase());
  }

  // Route order: by band, then prerequisites before dependants, then file order.
  const order = new Map(lib.competences.map((c, i) => [c.id, i]));
  const depth = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const c = lib.competence.get(id);
    return c?.prerequisites.length ? 1 + Math.max(...c.prerequisites.map((p) => depth(p, seen))) : 0;
  };
  lib.competences.sort(
    (a, b) =>
      BANDS.indexOf(a.band) - BANDS.indexOf(b.band) || depth(a.id) - depth(b.id) || order.get(a.id)! - order.get(b.id)!,
  );
  for (const [k, items] of lib.itemsByCompetence) lib.itemsByCompetence.set(k, [...items].sort((a, b) => a.difficulty - b.difficulty));
  return lib;
}

export const library: Library = buildLibrary(Object.values(modules));

export function bandAtLeast(b: Band, min: Band): boolean {
  return BANDS.indexOf(b) >= BANDS.indexOf(min);
}
