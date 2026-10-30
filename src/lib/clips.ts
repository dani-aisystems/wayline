/**
 * Natural voices: English lines pre-rendered at build time with Kokoro-82M (Apache-2.0, open weights),
 * shipped as small MP3 files under /voice. No network TTS at runtime and no per-use cost.
 *
 * Gender and accent labels come from the model's own voice list (hexgrad/Kokoro-82M VOICES.md), so they
 * are verified, not guessed. Lines without a clip fall back to the device's speech synthesis.
 */
export type NaturalVoice = { id: string; name: string; presents: "female" | "male"; accent: "US" | "GB"; primary: boolean };

export const NATURAL_VOICES: NaturalVoice[] = [
  { id: "af_heart", name: "Heart", presents: "female", accent: "US", primary: true },
  { id: "am_michael", name: "Michael", presents: "male", accent: "US", primary: true },
  { id: "bf_emma", name: "Emma", presents: "female", accent: "GB", primary: true },
  { id: "bm_george", name: "George", presents: "male", accent: "GB", primary: true },
  // Second voices, used when a scene has two characters of the same kind.
  { id: "af_bella", name: "Bella", presents: "female", accent: "US", primary: false },
  { id: "am_fenrir", name: "Fenrir", presents: "male", accent: "US", primary: false },
  { id: "bf_isabella", name: "Isabella", presents: "female", accent: "GB", primary: false },
  { id: "bm_fable", name: "Fable", presents: "male", accent: "GB", primary: false },
];
export const NARRATORS = NATURAL_VOICES.filter((v) => v.primary);
export const NATURAL_PREFIX = "natural:";
export const DEFAULT_NARRATOR = "af_heart";

/** The same text always maps to the same clip: straight quotes, single spaces, trimmed. */
export function normalizeLine(text: string): string {
  return text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

/** 53-bit FNV-1a pair → base36. Stable across the build script and the browser. */
export function clipKey(voice: string, text: string): string {
  const s = `${voice}|${normalizeLine(text)}`;
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = Math.imul(b ^ c, 2246822519) >>> 0;
  }
  return ((b & 0x1fffff) * 2 ** 32 + a).toString(36);
}

export type CastWish = { key: string; presents?: "female" | "male"; accent?: "US" | "GB" };

/**
 * One distinct, consistent natural voice per character, chosen from the authored identity
 * (presentation and accent). Unspecified presentations alternate so two speakers sound different.
 */
export function castNatural(chars: CastWish[], accent: "US" | "GB" = "US"): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  chars.forEach((c, i) => {
    const presents = c.presents ?? (i % 2 === 0 ? "female" : "male");
    const acc = c.accent ?? accent;
    const options = NATURAL_VOICES.filter((v) => v.presents === presents && v.accent === acc);
    const pick = options.find((v) => !used.has(v.id)) ?? options[0];
    used.add(pick.id);
    out.set(c.key, pick.id);
  });
  return out;
}

/** Narrator for a learner: their chosen natural voice, else one matching their accent. */
export function narratorFor(voiceId: string | undefined, accent?: string): string {
  if (voiceId?.startsWith(NATURAL_PREFIX)) return voiceId.slice(NATURAL_PREFIX.length);
  return accent === "GB" ? "bf_emma" : DEFAULT_NARRATOR;
}

/* ───────────────────────── Browser playback ───────────────────────── */

type Manifest = Record<string, [number, number, number]> & { _files?: string[] };
const BASE = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
const manifests = new Map<string, Promise<Manifest | null>>();
const bundles = new Map<string, Promise<ArrayBuffer | null>>();

function manifestFor(voice: string): Promise<Manifest | null> {
  let m = manifests.get(voice);
  if (!m) {
    m = fetch(`${BASE}voice/${voice}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .catch(() => null);
    manifests.set(voice, m);
  }
  return m;
}

function bundle(name: string): Promise<ArrayBuffer | null> {
  let b = bundles.get(name);
  if (!b) {
    b = fetch(`${BASE}voice/${name}`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    // A failed download is retried next time.
    void b.then((x) => { if (!x) bundles.delete(name); });
    bundles.set(name, b);
  }
  return b;
}

/** For tests: forget cached manifests and bundles. */
export function resetClips() {
  manifests.clear();
  bundles.clear();
}

/** Voices to try for a line: the wished one, then the same kind, then the same presentation, then any. */
export function fallbackOrder(wished: string): string[] {
  const want = NATURAL_VOICES.find((v) => v.id === wished);
  if (!want) return NATURAL_VOICES.map((v) => v.id);
  const rest = NATURAL_VOICES.filter((v) => v.id !== wished);
  return [
    wished,
    ...rest.filter((v) => v.presents === want.presents && v.accent === want.accent),
    ...rest.filter((v) => v.presents === want.presents && v.accent !== want.accent),
    ...rest.filter((v) => v.presents !== want.presents),
  ].map((v) => (typeof v === "string" ? v : v.id));
}

/** Find a natural clip for `text`, preferring `wished`. Returns a playable blob URL, or null. */
export async function findClip(text: string, wished: string): Promise<{ voice: string; url: string } | null> {
  for (const voice of fallbackOrder(wished)) {
    const m = await manifestFor(voice);
    const hit = m?.[clipKey(voice, text)];
    if (!m || !hit || !m._files) continue;
    const buf = await bundle(m._files[hit[0]]);
    if (!buf) return null;
    const url = URL.createObjectURL(new Blob([buf.slice(hit[1], hit[1] + hit[2])], { type: "audio/mpeg" }));
    return { voice, url };
  }
  return null;
}

let current: { audio: HTMLAudioElement; done: (ok: boolean) => void } | null = null;

export function stopClip() {
  if (!current) return;
  const c = current;
  current = null;
  c.audio.pause();
  c.done(false);
}

/** Play a clip and resolve when it ends (true), or when it fails or is stopped (false). */
export function playClip(url: string, rate = 1): Promise<boolean> {
  stopClip();
  const audio = new Audio(url);
  audio.playbackRate = rate;
  (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (current?.audio === audio) current = null;
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      resolve(ok);
    };
    current = { audio, done };
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    audio.play().catch(() => done(false));
  });
}
