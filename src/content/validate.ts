import { ContentPack, BANDS, type ContentPack as Pack, type Band } from "./schema";
import { SUPPORTED_LANGUAGES } from "../i18n/strings";

export type Issue = { level: "error" | "warning"; where: string; message: string };

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

      const key = "sentence" in item ? item.sentence : "prompt" in item ? item.prompt : item.tiles.join(" ");
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
