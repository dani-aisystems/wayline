import type { ExamTask } from "../../content/exams/schema";
import { castNatural, type CastWish } from "../../lib/clips";
import { parseDialogue } from "../../lib/speech";

/** One recording in a listening task: its lines, each with the natural voice that speaks it. */
export type Recording = { key: string; label: string; lines: { text: string; voice: string; speaker: string | null }[] };

/** The exam's examiner voice for the Speaking test. */
export const EXAMINER_VOICE = "bf_emma";

type Speaker = { name: string; presents: "female" | "male"; accent: "US" | "GB" };

function lines(script: string, speakers: Speaker[]): Recording["lines"] {
  const cast = castNatural(speakers.map((s): CastWish => ({ key: s.name, presents: s.presents, accent: s.accent })));
  const parsed = parseDialogue(script);
  if (parsed.length === 1 && !parsed[0].speaker) return [{ text: script.trim(), voice: cast.get(speakers[0]?.name) ?? "af_heart", speaker: speakers[0]?.name ?? null }];
  return parsed.map((l) => ({ text: l.text, voice: cast.get(l.speaker!) ?? cast.values().next().value ?? "af_heart", speaker: l.speaker }));
}

/**
 * The recordings in a listening task, with voices fixed by the authored speakers. Shared by the player
 * and the voice build script, so the pre-rendered clips match exactly.
 */
export function recordings(t: ExamTask): Recording[] {
  switch (t.kind) {
    case "listen-mc":
      return t.extracts.map((e, i) => ({ key: `${t.id}#${i}`, label: e.context, lines: lines(e.script, e.speakers) }));
    case "listen-sentence":
      return [{ key: t.id, label: t.context, lines: lines(t.script, t.speakers) }];
    case "listen-matching": {
      // Five different people: cast them together so each speaker has a distinct voice.
      const cast = castNatural(t.monologues.map((m, i) => ({ key: String(i), presents: m.speaker.presents, accent: m.speaker.accent })));
      return t.monologues.map((m, i) => ({ key: `${t.id}#${i}`, label: `Speaker ${i + 1}`, lines: [{ text: m.script.trim(), voice: cast.get(String(i))!, speaker: m.speaker.name }] }));
    }
    default:
      return [];
  }
}
