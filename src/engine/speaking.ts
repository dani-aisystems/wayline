/**
 * Deterministic comparison of a recognised transcript with a target sentence.
 * This measures whether the expected WORDS were recognised. It is not a pronunciation, accent,
 * fluency or CEFR speaking score, and the interface never presents it as one.
 */
const NUMBERS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
  thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
};
const CONTRACTIONS: Record<string, string[]> = {
  "i'm": ["i", "am"], "you're": ["you", "are"], "he's": ["he", "is"], "she's": ["she", "is"], "it's": ["it", "is"], "we're": ["we", "are"],
  "they're": ["they", "are"], "what's": ["what", "is"], "that's": ["that", "is"], "there's": ["there", "is"], "isn't": ["is", "not"],
  "aren't": ["are", "not"], "don't": ["do", "not"], "doesn't": ["does", "not"], "didn't": ["did", "not"], "can't": ["can", "not"],
  "won't": ["will", "not"], "i've": ["i", "have"], "i'd": ["i", "would"], "i'll": ["i", "will"], "let's": ["let", "us"], "wasn't": ["was", "not"],
};

export function words(s: string): string[] {
  const raw = s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => CONTRACTIONS[w] ?? [w])
    .map((w) => NUMBERS[w] ?? w.replace(/^'+|'+$/g, ""));
  // "twenty one" / "twenty-one" → "21", matching how recognisers usually write numbers.
  const out: string[] = [];
  for (const w of raw) {
    const prev = out.at(-1);
    if (prev && /^[2-9]0$/.test(prev) && /^[1-9]$/.test(w)) out[out.length - 1] = String(Number(prev) + Number(w));
    else out.push(w);
  }
  return out;
}

export type WordCheck = { word: string; status: "heard" | "missing" };
export type Comparison = { target: WordCheck[]; extra: string[]; coverage: number; complete: boolean };

/** Align target words with the transcript (longest common subsequence) so order matters but small slips don't. */
export function compareSpeech(target: string, transcript: string): Comparison {
  const t = words(target);
  const h = words(transcript);
  const dp = Array.from({ length: t.length + 1 }, () => new Array<number>(h.length + 1).fill(0));
  for (let i = t.length - 1; i >= 0; i--) for (let j = h.length - 1; j >= 0; j--) dp[i][j] = t[i] === h[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: WordCheck[] = [];
  const usedH = new Set<number>();
  let i = 0, j = 0;
  while (i < t.length) {
    if (j < h.length && t[i] === h[j]) { out.push({ word: t[i], status: "heard" }); usedH.add(j); i++; j++; }
    else if (j < h.length && dp[i][j + 1] >= dp[i + 1][j]) j++;
    else { out.push({ word: t[i], status: "missing" }); i++; }
  }
  const extra = h.filter((_, k) => !usedH.has(k));
  const heard = out.filter((w) => w.status === "heard").length;
  const coverage = t.length ? heard / t.length : 0;
  return { target: out, extra, coverage, complete: coverage >= 0.85 };
}

/** For open answers: which required keywords (any of the alternatives in each group) were said. */
export function checkKeywords(groups: string[][], transcript: string): { group: string[]; found: boolean }[] {
  const said = new Set(words(transcript));
  return groups.map((g) => ({ group: g, found: g.some((alt) => words(alt).every((w) => said.has(w))) }));
}
