import { Rating } from "ts-fsrs";
import { db, type Profile, type WaylineDB } from "../db/db";
import { library as defaultLibrary, type Library } from "../content/library";
import type { Skill } from "../content/schema";

/**
 * The learner model: one place that turns stored evidence (answers, placement, mistakes) into
 * skill estimates and priorities. Everything here is deterministic and derived from the database.
 */
export const SKILLS: Skill[] = ["vocabulary", "grammar", "reading", "listening", "speaking", "writing"];

export type SkillStat = {
  skill: Skill;
  /** Recency-weighted share of first-try correct answers, or null with too little evidence. */
  accuracy: number | null;
  attempts: number;
  /** Placement estimate for this skill, if the test measured it. */
  placed: string | null;
};

export type LearnerModel = {
  skills: Record<Skill, SkillStat>;
  /** Skills that get extra weight today, with why. */
  priorities: { skill: Skill; reason: "focus" | "weak-practice" | "weak-placement" | "goal" }[];
  /** Unresolved mistakes grouped by tag, most frequent first. */
  weakTags: { tag: string; count: number; itemIds: string[] }[];
};

const MIN_EVIDENCE = 5;

const GOAL_SKILLS: Record<NonNullable<Profile["goal"]>, Skill[]> = {
  everyday: ["speaking", "listening"],
  travel: ["listening", "speaking"],
  work: ["speaking", "writing"],
  study: ["reading", "writing"],
  exam: ["grammar", "reading"],
  allround: [],
};

export async function learnerModel(profile: Profile, lib: Library = defaultLibrary, database: WaylineDB = db): Promise<LearnerModel> {
  const logs = await database.reviews.toArray();
  const bySkill = new Map<Skill, { w: number; ok: number; n: number }>();
  // Newest answers weigh more (each older answer counts 0.95× the next newer one).
  const sorted = [...logs].sort((a, b) => b.log.review.getTime() - a.log.review.getTime());
  const seen = new Map<Skill, number>();
  for (const r of sorted) {
    if (!r.cardId.startsWith("item:")) continue;
    const item = lib.item.get(r.cardId.slice(5));
    if (!item) continue;
    const k = seen.get(item.skill) ?? 0;
    seen.set(item.skill, k + 1);
    const weight = 0.95 ** k;
    const s = bySkill.get(item.skill) ?? { w: 0, ok: 0, n: 0 };
    s.w += weight;
    s.ok += r.log.rating === Rating.Good || r.log.rating === Rating.Easy ? weight : 0;
    s.n += 1;
    bySkill.set(item.skill, s);
  }

  const placement = (await database.placements.orderBy("at").last())?.result;
  const placedSkill = (k: Skill) => {
    const map: Partial<Record<Skill, string>> = { grammar: "grammar", vocabulary: "vocabulary", reading: "reading", listening: "listening" };
    const hit = placement?.skills.find((x) => x.skill === map[k]);
    return hit?.band ?? null;
  };

  const skills = Object.fromEntries(
    SKILLS.map((k) => {
      const s = bySkill.get(k);
      return [k, { skill: k, accuracy: s && s.n >= MIN_EVIDENCE ? s.ok / s.w : null, attempts: s?.n ?? 0, placed: placedSkill(k) }];
    }),
  ) as Record<Skill, SkillStat>;

  const priorities: LearnerModel["priorities"] = [];
  const add = (skill: Skill, reason: LearnerModel["priorities"][number]["reason"]) => {
    if (!priorities.some((p) => p.skill === skill)) priorities.push({ skill, reason });
  };
  for (const k of SKILLS) if (skills[k].accuracy !== null && skills[k].accuracy! < 0.65) add(k, "weak-practice");
  for (const w of placement?.weakSkills ?? []) if ((SKILLS as string[]).includes(w)) add(w as Skill, "weak-placement");
  for (const f of profile.focusSkills ?? []) if ((SKILLS as string[]).includes(f)) add(f as Skill, "focus");
  for (const g of GOAL_SKILLS[profile.goal ?? "allround"]) add(g, "goal");

  const open = (await database.mistakes.toArray()).filter((m) => !m.resolved);
  const tags = new Map<string, { tag: string; count: number; itemIds: Set<string> }>();
  for (const m of open) {
    const item = lib.item.get(m.itemId);
    const keys = item?.structures.length ? item.structures : m.tags.length ? m.tags : [m.competence];
    for (const tag of keys) {
      const t = tags.get(tag) ?? { tag, count: 0, itemIds: new Set<string>() };
      t.count += 1;
      t.itemIds.add(m.itemId);
      tags.set(tag, t);
    }
  }
  const weakTags = [...tags.values()]
    .map((t) => ({ tag: t.tag, count: t.count, itemIds: [...t.itemIds] }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return { skills, priorities, weakTags };
}

/** How much a competence matches today's priorities (higher = sooner). */
export function competenceWeight(skills: Skill[], model: LearnerModel): number {
  const weight = { "weak-practice": 3, "weak-placement": 2, focus: 2, goal: 1 } as const;
  return skills.reduce((sum, s) => sum + (model.priorities.find((p) => p.skill === s) ? weight[model.priorities.find((p) => p.skill === s)!.reason] : 0), 0);
}
