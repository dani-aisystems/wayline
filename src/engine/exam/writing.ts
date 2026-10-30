import type { ExamTask } from "../../content/exams/schema";
import { partSpec } from "../../content/exams/spec";

type Writing = Extract<ExamTask, { kind: "writing" }>;
export type Subscale = "content" | "communicative" | "organisation" | "language";
export const SUBSCALES: Subscale[] = ["content", "communicative", "organisation", "language"];

export type WritingCheck = {
  words: number;
  range: [number, number];
  points: { label: string; found: boolean }[];
  paragraphs: number;
  linkers: string[];
  conventions: { label: string; ok: boolean }[];
  registerIssues: string[];
  lexicalVariety: number; // moving-average type/token ratio, 0–1
  sentenceVariety: number; // standard deviation of sentence length (words)
  structures: string[]; // complex structures detected
  repeated: string[]; // content words used 4+ times
  /** Automatic indicator per subscale (0–5). Not an examiner mark. */
  indicator: Record<Subscale, number>;
};

const LINKERS = [
  "however", "although", "though", "even though", "whereas", "while", "nevertheless", "nonetheless", "despite", "in spite of",
  "on the other hand", "on the contrary", "furthermore", "moreover", "in addition", "what is more", "besides", "as well as",
  "therefore", "consequently", "as a result", "thus", "hence", "because", "since", "due to", "owing to",
  "for example", "for instance", "such as", "in particular", "firstly", "secondly", "finally", "lastly", "to begin with",
  "in conclusion", "to sum up", "overall", "all things considered", "on balance", "in my view", "in my opinion", "to my mind",
  "that said", "admittedly", "in contrast", "similarly", "likewise", "not only", "as long as", "provided that", "unless",
];
const INFORMAL = ["gonna", "wanna", "kinda", "stuff", "awesome", "cool", "kids", "guys", "a lot of", "lots of", "!!", "btw", "ok"];
const STOP = new Set("the a an and or but of to in on at for with by from is are was were be been being it this that these those i you he she we they my your our their its as not have has had do does did will would can could should may might must so if than then there here which who whom whose what when where why how very also more most just only about into over after before because all any some such no".split(" "));

const words = (s: string) => s.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];

function mattr(ws: string[], win = 40): number {
  if (ws.length < win) return ws.length ? new Set(ws).size / ws.length : 0;
  let sum = 0;
  for (let i = 0; i + win <= ws.length; i++) sum += new Set(ws.slice(i, i + win)).size / win;
  return sum / (ws.length - win + 1);
}

const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(n)));

/**
 * Transparent, rule-based indicators of the four official subscales. They count observable features
 * (task points mentioned, paragraphs, linking, conventions, variety); they cannot judge quality the way
 * an examiner does, so the learner confirms each mark against the official descriptors.
 */
export function checkWriting(t: Writing, text: string): WritingCheck {
  const range = partSpec(t.exam, "writing", t.part)!.words!;
  const ws = words(text);
  const lower = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const paragraphs = text.split(/\n\s*\n|\n(?=\s*[A-Z])/).map((p) => p.trim()).filter((p) => p.split(/\s+/).length >= 3).length;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // Whole-word matching, so "tax" doesn't match "taxi" and "you" doesn't match "young".
  const has = (k: string) => {
    const w = k.toLowerCase().trim();
    if (!/[a-z0-9]/.test(w)) return lower.includes(w);
    return new RegExp(`(^|[^a-z0-9'])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9'])`).test(lower);
  };
  const points = t.points.map((p) => ({ label: p.label, found: p.keywords.some(has) }));
  const linkers = LINKERS.filter((l) => new RegExp(`\\b${l}\\b`).test(lower));
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => words(s).length).filter((n) => n > 0);
  const mean = sentences.reduce((a, b) => a + b, 0) / Math.max(1, sentences.length);
  const sentenceVariety = Math.sqrt(sentences.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, sentences.length));
  const structures = [
    [/\b(which|who|whose|whom)\b/, "relative clauses"],
    [/\b(is|are|was|were|been|being|be)\s+\w+(ed|en)\b/, "passive"],
    [/\b(if|unless|provided that|as long as)\b/, "conditionals"],
    [/\b(not only|rarely|seldom|never before|hardly|no sooner|little did|only when)\b/, "inversion"],
    [/\b(what i|it is .{1,30} that|the reason why)\b/, "cleft / emphasis"],
    [/\b(should|might|could|would|may) have\b/, "perfect modals"],
    [/\b\w+ing\b,/, "participle clauses"],
  ]
    .filter(([re]) => (re as RegExp).test(lower))
    .map(([, l]) => l as string);
  const counts = new Map<string, number>();
  for (const w of ws) if (!STOP.has(w) && w.length > 3) counts.set(w, (counts.get(w) ?? 0) + 1);
  const repeated = [...counts].filter(([, c]) => c >= 4).map(([w]) => w);

  const conventions: { label: string; ok: boolean }[] = [];
  const first = lines[0]?.toLowerCase() ?? "";
  if (t.genre === "email" || t.genre === "letter") {
    conventions.push({ label: "greeting", ok: /^(dear|hi|hello)\b/.test(first) });
    conventions.push({ label: "sign-off", ok: /(regards|sincerely|faithfully|best wishes|all the best|love|cheers|thanks)/.test(lines.slice(-3).join(" ").toLowerCase()) });
  }
  if (t.genre === "report" || t.genre === "proposal") {
    const headings = lines.filter((l) => l.split(/\s+/).length <= 6 && !/[.!?]$/.test(l)).length;
    conventions.push({ label: "headings", ok: headings >= 3 });
  }
  if (t.genre === "article" || t.genre === "review") conventions.push({ label: "title", ok: !!lines[0] && lines[0].split(/\s+/).length <= 10 && !/[.]$/.test(lines[0]) });
  if (t.genre === "essay") {
    conventions.push({ label: "conclusion", ok: /(in conclusion|to sum up|overall|all things considered|on balance|to conclude)/.test(lower) });
    conventions.push({ label: "opinion", ok: /(in my (view|opinion)|i (believe|think|feel)|to my mind|i would argue|it seems to me)/.test(lower) });
  }

  const registerIssues: string[] = [];
  if (t.register === "formal") {
    const contractions = (text.match(/\b\w+'(s|re|ve|ll|d|m|t)\b/gi) ?? []).filter((c) => !/'s$/i.test(c) || /\b(it|that|there|what|he|she)'s\b/i.test(c));
    if (contractions.length >= 2) registerIssues.push(`contractions: ${[...new Set(contractions)].slice(0, 4).join(", ")}`);
    const informal = INFORMAL.filter((w) => lower.includes(` ${w} `) || (w.startsWith("!") && lower.includes(w)));
    if (informal.length) registerIssues.push(`informal words: ${informal.join(", ")}`);
  }

  const n = ws.length;
  const lengthOk = n >= range[0] * 0.9 && n <= range[1] * 1.15;
  // C1 essays: "choose two of three" points count as one requirement met by any two of them.
  const choice = points.filter((p) => /two of (the )?three/i.test(p.label));
  const fixed = points.filter((p) => !choice.includes(p));
  const covered = (fixed.filter((p) => p.found).length + (choice.length ? Math.min(2, choice.filter((p) => p.found).length) / 2 : 0)) / Math.max(1, fixed.length + (choice.length ? 1 : 0));
  const conventionsOk = conventions.length ? conventions.filter((c) => c.ok).length / conventions.length : 1;
  const variety = mattr(ws);
  const indicator: Record<Subscale, number> = {
    content: n < range[0] * 0.5 ? 1 : clamp(1 + covered * 4 - (lengthOk ? 0 : 1)),
    communicative: clamp(1 + conventionsOk * 2 + (registerIssues.length ? 0 : 1.5) + (lengthOk ? 0.5 : 0)),
    organisation: clamp((paragraphs >= 4 ? 2 : paragraphs >= 3 ? 1.5 : paragraphs >= 2 ? 1 : 0) + Math.min(3, linkers.length / 2)),
    language: clamp((variety - 0.55) * 10 + Math.min(2, structures.length / 2) + (sentenceVariety > 5 ? 1 : 0) - repeated.length * 0.5),
  };
  if (n < 30) for (const k of Object.keys(indicator) as Subscale[]) indicator[k] = Math.min(indicator[k], n === 0 ? 0 : 1);
  return { words: n, range, points, paragraphs, linkers, conventions, registerIssues, lexicalVariety: variety, sentenceVariety, structures, repeated, indicator };
}
