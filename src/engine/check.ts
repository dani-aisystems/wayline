import { normalizeAnswer, type Item } from "../content/schema";

export type Answer = { kind: "text"; value: string } | { kind: "choice"; index: number } | { kind: "tiles"; tiles: string[] };

/** Deterministic answer checking. Typed answers ignore case, extra spaces, curly quotes and final punctuation. */
export function checkAnswer(item: Item, answer: Answer): boolean {
  switch (item.type) {
    case "choice":
      return answer.kind === "choice" && answer.index === item.correct;
    case "cloze": {
      if (answer.kind !== "text") return false;
      const given = normalizeAnswer(answer.value);
      return item.accept.some((a) => normalizeAnswer(a) === given);
    }
    case "build": {
      if (answer.kind !== "tiles") return false;
      const given = normalizeAnswer(answer.tiles.join(" "));
      return item.accept.some((a) => normalizeAnswer(a) === given);
    }
  }
}

/** The answer to show after the learner gives up. */
export function modelAnswer(item: Item): string {
  switch (item.type) {
    case "choice":
      return item.options[item.correct];
    case "cloze":
      return item.sentence.replace("___", item.accept[0]);
    case "build":
      return item.accept[0];
  }
}

/** Shuffle deterministically per item so tiles/options don't reorder on every render. */
export function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  // Never present tiles already in the correct order.
  if (out.length > 1 && out.every((v, i) => v === arr[i])) out.push(out.shift()!);
  return out;
}
