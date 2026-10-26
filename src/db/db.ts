import Dexie, { type EntityTable } from "dexie";
import type { Card, ReviewLog } from "ts-fsrs";
import type { UiLanguage } from "../i18n/strings";
import type { Band } from "../content/schema";

/** One row, id "me". Everything the learner chose or was placed at. */
export interface Profile {
  id: "me";
  createdAt: string;
  explanationLanguage: UiLanguage;
  theme: "system" | "light" | "dark";
  goal?: "everyday" | "work" | "study" | "travel" | "exam" | "allround";
  interests: string[];
  dailyMinutes?: 10 | 20 | 30 | 45;
  placedBand?: Band;
  acceptedBand?: Band;
  lastBackupAt?: string;
}

/** A reviewable thing (word, structure, item) with its FSRS memory state and where it was met. */
export interface StudyCard {
  id: string;
  kind: "word" | "item" | "structure";
  ref: string;
  context?: string;
  fsrs: Card;
  createdAt: string;
}

export interface ReviewRow {
  id?: number;
  cardId: string;
  log: ReviewLog;
}

export interface MasteryRow {
  competence: string;
  correct: number;
  attempts: number;
  hintsUsed: number;
  masteredAt?: string;
  updatedAt: string;
}

export interface MistakeRow {
  id?: number;
  itemId: string;
  competence: string;
  tags: string[];
  given: string;
  at: string;
  resolved: boolean;
}

export interface ActivityRow {
  day: string; // YYYY-MM-DD, local
  minutes: number;
  reviews: number;
  newItems: number;
}

export class WaylineDB extends Dexie {
  profile!: EntityTable<Profile, "id">;
  cards!: EntityTable<StudyCard, "id">;
  reviews!: EntityTable<ReviewRow, "id">;
  mastery!: EntityTable<MasteryRow, "competence">;
  mistakes!: EntityTable<MistakeRow, "id">;
  activity!: EntityTable<ActivityRow, "day">;

  constructor(name = "wayline") {
    super(name);
    this.version(1).stores({
      profile: "id",
      cards: "id, kind, ref, fsrs.due",
      reviews: "++id, cardId",
      mastery: "competence",
      mistakes: "++id, itemId, competence, resolved",
      activity: "day",
    });
  }
}

export const db = new WaylineDB();

export const TABLES = ["profile", "cards", "reviews", "mastery", "mistakes", "activity"] as const;
export type TableName = (typeof TABLES)[number];

/** Ask the browser not to evict our data. Only call after the learner has engaged (Dexie's advice). */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
