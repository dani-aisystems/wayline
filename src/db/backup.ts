import { z } from "zod";
import { db, TABLES, type WaylineDB } from "./db";
import { BANDS } from "../content/schema";
import { SUPPORTED_LANGUAGES } from "../i18n/strings";

export const BACKUP_FORMAT = "wayline-backup";
/** 2 adds placements, xp and achievements. Version 1 backups still restore (those tables start empty). */
export const BACKUP_SCHEMA_VERSION = 2;
const MAX_ROWS = 200_000;
const str = z.string().max(2000);
const date = z.coerce.date().refine((d) => !Number.isNaN(d.getTime()), "invalid date");

const FsrsCard = z.object({
  due: date,
  stability: z.number().finite(),
  difficulty: z.number().finite(),
  elapsed_days: z.number().finite(),
  scheduled_days: z.number().finite(),
  learning_steps: z.number().int().min(0),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  state: z.number().int().min(0).max(3),
  last_review: date.optional(),
});

const Rows = {
  profile: z.array(
    z.object({
      id: z.literal("me"),
      createdAt: str,
      explanationLanguage: z.enum(SUPPORTED_LANGUAGES),
      theme: z.enum(["system", "light", "dark"]),
      goal: z.enum(["everyday", "work", "study", "travel", "exam", "allround"]).optional(),
      interests: z.array(str).max(50),
      dailyMinutes: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(45)]).optional(),
      placedBand: z.enum(BANDS).optional(),
      acceptedBand: z.enum(BANDS).optional(),
      lastBackupAt: str.optional(),
      onboardedAt: str.optional(),
      voiceId: str.optional(),
      seenNotes: z.array(str).max(5000).default([]),
      placementSource: z.enum(["reading-check", "diagnostic", "chosen"]).optional(),
      focusSkills: z.array(str).max(10).optional(),
      selfRating: str.optional(),
      recognitionConsent: z.boolean().optional(),
      micDeviceId: str.optional(),
      accent: z.enum(["US", "GB"]).optional(),
      placementDraft: z
        .object({
          mode: z.enum(["quick", "extended"]), priorMean: z.number().finite(),
          responses: z.array(z.object({ itemId: str, correct: z.boolean() })).max(200),
          skipSkills: z.array(str).max(10), startedAt: str,
        })
        .optional(),
    }),
  ).max(1),
  cards: z.array(
    z.object({
      id: str,
      kind: z.enum(["word", "item", "structure"]),
      ref: str,
      context: str.optional(),
      lastOutcome: z.enum(["first", "hint", "revealed"]).optional(),
      fsrs: FsrsCard,
      createdAt: str,
    }),
  ),
  reviews: z.array(
    z.object({
      id: z.number().int().optional(),
      cardId: str,
      log: z.object({
        rating: z.number().int().min(0).max(4),
        state: z.number().int().min(0).max(3),
        due: date,
        stability: z.number().finite(),
        difficulty: z.number().finite(),
        elapsed_days: z.number().finite(),
        last_elapsed_days: z.number().finite(),
        scheduled_days: z.number().finite(),
        learning_steps: z.number().int().min(0),
        review: date,
      }),
    }),
  ),
  mastery: z.array(
    z.object({
      competence: str,
      correct: z.number().int().min(0),
      attempts: z.number().int().min(0),
      hintsUsed: z.number().int().min(0),
      masteredAt: str.optional(),
      updatedAt: str,
    }),
  ),
  mistakes: z.array(
    z.object({
      id: z.number().int().optional(),
      itemId: str,
      competence: str,
      tags: z.array(str).max(50),
      given: str,
      at: str,
      resolved: z.boolean(),
    }),
  ),
  activity: z.array(
    z.object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      minutes: z.number().min(0),
      reviews: z.number().int().min(0),
      newItems: z.number().int().min(0),
    }),
  ),
  placements: z.array(
    z.object({
      id: z.number().int().optional(),
      at: str,
      mode: z.enum(["quick", "extended"]),
      responses: z.array(z.object({ itemId: str, correct: z.boolean() })).max(200),
      result: z.object({
        theta: z.number().finite(), se: z.number().finite(), band: str, recommended: str, range: z.tuple([str, str]),
        confidence: z.enum(["high", "medium", "low"]),
        skills: z.array(z.object({ skill: str, band: str.nullable(), theta: z.number().finite().nullable(), items: z.number().int(), correct: z.number().int() })),
        weakTopics: z.array(z.object({ topic: str, skill: str, missed: z.number().int() })),
        strongSkills: z.array(str), weakSkills: z.array(str), items: z.number().int(), skipped: z.array(str),
      }),
      accepted: str.optional(),
    }),
  ).default([]),
  xp: z.array(
    z.object({
      id: str, at: str, day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number().int().min(0).max(500),
      reason: z.enum(["lesson", "review", "speaking", "listening", "placement", "plan", "word", "achievement"]),
    }),
  ).default([]),
  achievements: z.array(z.object({ id: str, at: str })).default([]),
};

export const Backup = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  appVersion: str,
  exportedAt: str,
  data: z.object(Rows).refine(
    (d) => Object.values(d).reduce((n, rows) => n + rows.length, 0) <= MAX_ROWS,
    "backup is too large",
  ),
});
export type Backup = z.infer<typeof Backup>;

export async function exportBackup(database: WaylineDB = db, appVersion = __APP_VERSION__): Promise<Backup> {
  const data = Object.fromEntries(
    await Promise.all(TABLES.map(async (t) => [t, await database.table(t).toArray()] as const)),
  ) as Backup["data"];
  return { format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, appVersion, exportedAt: new Date().toISOString(), data };
}

export function backupFileName(now = new Date()): string {
  return `wayline-backup-${now.toISOString().slice(0, 10)}.json`;
}

export type ImportResult = { ok: true; rows: number } | { ok: false; error: string };

/**
 * Validate and restore a backup. Untrusted input: parsed as JSON only, validated by schema,
 * never rendered as HTML. "replace" wipes current progress inside the same transaction.
 */
export async function importBackup(text: string, database: WaylineDB = db): Promise<ImportResult> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "not-json" };
  }
  const parsed = Backup.safeParse(json);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { data } = parsed.data;
  let rows = 0;
  await database.transaction("rw", TABLES.map((t) => database.table(t)), async () => {
    for (const t of TABLES) {
      await database.table(t).clear();
      const tableRows = data[t] as unknown[];
      if (tableRows.length) await database.table(t).bulkAdd(tableRows);
      rows += tableRows.length;
    }
  });
  return { ok: true, rows };
}
