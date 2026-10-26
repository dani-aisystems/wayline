import { z } from "zod";
import { db, TABLES, type WaylineDB } from "./db";
import { BANDS } from "../content/schema";
import { SUPPORTED_LANGUAGES } from "../i18n/strings";

export const BACKUP_FORMAT = "wayline-backup";
export const BACKUP_SCHEMA_VERSION = 1;
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
};

export const Backup = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
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
