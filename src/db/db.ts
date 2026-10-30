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
  onboardedAt?: string;
  /** Preferred English TTS voice (voiceURI). */
  voiceId?: string;
  /** Notes ("Understand" cards) already shown, so they are not repeated in every session. */
  seenNotes: string[];
  /** How the start level was set. "reading-check" = pre-diagnostic onboarding (v1), offered a diagnostic later. */
  placementSource?: "reading-check" | "diagnostic" | "chosen";
  /** Skills the learner said matter most to them. */
  focusSkills?: string[];
  /** The learner's own description of their English (sets the test's starting point only). */
  selfRating?: string;
  /** A placement test in progress, so a reload or interruption resumes it. */
  /** The learner agreed that cloud speech recognition may receive their voice. */
  recognitionConsent?: boolean;
  micDeviceId?: string;
  /** Preferred accent for single-voice audio. */
  accent?: "US" | "GB";
  placementDraft?: { mode: "quick" | "extended"; priorMean: number; responses: { itemId: string; correct: boolean }[]; skipSkills: string[]; startedAt: string };
  /** Learning pathway. "exam" = certification preparation; switching back keeps all exam data. */
  track?: "general" | "exam";
  /** Certification target, kept even when the learner switches back to general English. */
  cert?: CertGoal;
}

export type CertExam = "b2-first" | "c1-advanced";
export interface CertGoal {
  exam: CertExam;
  /** YYYY-MM-DD, if booked. */
  date?: string;
  /** Target Cambridge English Scale score (e.g. 180 = C1 Advanced Grade C). */
  target?: number;
  format?: "digital" | "paper";
  setAt: string;
}

export type ExamSkill = "reading" | "useOfEnglish" | "writing" | "listening" | "speaking";

/** One exam practice session: a single part, a whole paper, a full mock or the exam diagnostic. */
export interface ExamAttemptRow {
  id?: number;
  exam: CertExam;
  mode: "topic" | "section" | "paper" | "mock" | "diagnostic";
  paper?: "reading" | "writing" | "listening" | "speaking";
  set?: string;
  taskIds: string[];
  startedAt: string;
  finishedAt?: string;
  timed: boolean;
  limitSeconds?: number;
  seconds: number;
  /** Answers in progress (taskId → question number → text), so an interrupted test resumes. */
  draft?: Record<string, Record<string, string>>;
  skills?: Partial<Record<ExamSkill, { raw: number; max: number }>>;
}

/** One scored question (or one writing/speaking criterion) — the evidence for readiness and weaknesses. */
export interface ExamAnswerRow {
  id?: number;
  attemptId: number;
  exam: CertExam;
  taskId: string;
  paper: "reading" | "writing" | "listening" | "speaking";
  part: number;
  skill: ExamSkill;
  n: number;
  tag: string;
  marks: number;
  max: number;
  given: string;
  at: string;
  timed: boolean;
  seconds?: number;
  /** For writing/speaking: how the mark was given. */
  source?: "auto" | "self";
}

/** One completed placement test, kept so results can be compared and nothing is overwritten. */
export interface PlacementRow {
  id?: number;
  at: string;
  mode: "quick" | "extended";
  responses: { itemId: string; correct: boolean }[];
  result: {
    theta: number;
    se: number;
    band: string;
    recommended: string;
    range: [string, string];
    confidence: "high" | "medium" | "low";
    skills: { skill: string; band: string | null; theta: number | null; items: number; correct: number }[];
    weakTopics: { topic: string; skill: string; missed: number }[];
    strongSkills: string[];
    weakSkills: string[];
    items: number;
    skipped: string[];
  };
  accepted?: string;
}

/** XP ledger. `id` is an idempotency key, so the same completion can never pay twice. */
export interface XpRow {
  id: string;
  at: string;
  day: string;
  amount: number;
  reason: "lesson" | "review" | "speaking" | "listening" | "placement" | "plan" | "word" | "achievement";
}

export interface AchievementRow {
  id: string;
  at: string;
}

/** A reviewable thing (word, structure, item) with its FSRS memory state and where it was met. */
export interface StudyCard {
  id: string;
  kind: "word" | "item" | "structure";
  ref: string;
  context?: string;
  /** How the learner did the last time (items only). */
  lastOutcome?: "first" | "hint" | "revealed";
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
  placements!: EntityTable<PlacementRow, "id">;
  xp!: EntityTable<XpRow, "id">;
  achievements!: EntityTable<AchievementRow, "id">;
  examAttempts!: EntityTable<ExamAttemptRow, "id">;
  examAnswers!: EntityTable<ExamAnswerRow, "id">;

  constructor(name = "wayline") {
    // Dexie 4's query cache served stale results after updates (exam dashboard right after a practice); correctness first.
    super(name, { cache: "disabled" });
    this.version(1).stores({
      profile: "id",
      cards: "id, kind, ref, fsrs.due",
      reviews: "++id, cardId",
      mastery: "competence",
      mistakes: "++id, itemId, competence",
      activity: "day",
    });
    // v2 (Wayline 0.2): placement history, XP ledger, achievements. Adds tables only — no v1 row is changed or removed.
    this.version(2)
      .stores({
        placements: "++id, at",
        xp: "id, day, reason",
        achievements: "id",
      })
      .upgrade(async (tx) => {
        // Learners placed by the old reading check keep their level and progress; they're offered the diagnostic later.
        await tx.table("profile").toCollection().modify((p: Profile) => {
          if (p.onboardedAt && !p.placementSource) p.placementSource = "reading-check";
          // Fill list fields that very early builds could leave unset.
          p.seenNotes ??= [];
          p.interests ??= [];
        });
      });
    // v3 (Wayline 0.3): certification preparation. Adds tables only.
    this.version(3).stores({
      examAttempts: "++id, exam, mode, startedAt",
      examAnswers: "++id, attemptId, exam, taskId, tag, skill, at",
    });
  }
}

export const db = new WaylineDB();

export const TABLES = ["profile", "cards", "reviews", "mastery", "mistakes", "activity", "placements", "xp", "achievements", "examAttempts", "examAnswers"] as const;
export type TableName = (typeof TABLES)[number];

/** Ask the browser not to evict our data. Only call after the learner has engaged (Dexie's advice). */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
