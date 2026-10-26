/**
 * English text-to-speech with the device's own voices (Web Speech API). No network TTS.
 *
 * Browsers don't report a voice's gender. We label a voice male- or female-presenting only when its
 * name matches a known system voice (Apple, Microsoft, Google, Android, eSpeak variants listed below);
 * every other voice stays unlabelled ("Voice 1, 2…") rather than guessing.
 */
export type Presentation = "female" | "male";
export type Accent = "US" | "GB" | "AU" | "IE" | "CA" | "IN" | "NZ" | "ZA" | "other";
export type VoiceOption = { id: string; name: string; lang: string; local: boolean; presents: Presentation | null; accent: Accent };

const ENGLISH = /^en([-_][A-Za-z]{2})?$/i;

/** Known English system voices by first name / product name. Keep this list to voices we have verified. */
const FEMALE = /\b(Samantha|Karen|Moira|Tessa|Fiona|Victoria|Allison|Ava|Susan|Zira|Aria|Jenny|Libby|Sonia|Hazel|Catherine|Serena|Kate|Martha|Nicky|Emma|Sara|Michelle|Natasha|Clara|Ana|Joanna|Salli|Kimberly|Kendra|Ivy|Amy|Linda|Heera|Neerja|Veena|Isla|Female)\b/i;
const MALE = /\b(Daniel|Alex|Fred|Tom|Oliver|Arthur|Aaron|Rishi|Gordon|David|Mark|George|Guy|Ryan|Thomas|James|Christopher|Eric|Brian|Lee|Reed|Ralph|Prabhat|Liam|William|Matthew|Justin|Joey|Russell|Male)\b/i;
/** Google's unnamed "Google US English" voice is female-presenting. */
const GOOGLE_US = /^Google US English$/i;

export function presentationOf(name: string): Presentation | null {
  if (GOOGLE_US.test(name)) return "female";
  const f = FEMALE.test(name);
  const m = MALE.test(name);
  if (f && !m) return "female";
  if (m && !f) return "male";
  return null;
}

export function accentOf(lang: string): Accent {
  const region = lang.replace("_", "-").split("-")[1]?.toUpperCase();
  return (["US", "GB", "AU", "IE", "CA", "IN", "NZ", "ZA"] as const).find((r) => r === region) ?? "other";
}

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

/** Voices load asynchronously in Chrome and need polling in Safari. */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!speechAvailable()) return Promise.resolve([]);
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(synth.getVoices().filter((v) => ENGLISH.test(v.lang)));
    };
    if (synth.getVoices().length) return finish();
    const start = Date.now();
    const poll = window.setInterval(() => {
      if (synth.getVoices().length || Date.now() - start > timeoutMs) {
        window.clearInterval(poll);
        finish();
      }
    }, 100);
    synth.addEventListener?.("voiceschanged", () => { window.clearInterval(poll); finish(); }, { once: true });
  });
}

export function toOption(v: SpeechSynthesisVoice): VoiceOption {
  return { id: v.voiceURI, name: v.name, lang: v.lang.replace("_", "-"), local: v.localService, presents: presentationOf(v.name), accent: accentOf(v.lang) };
}

let cached: SpeechSynthesisVoice[] | null = null;
async function voices(): Promise<SpeechSynthesisVoice[]> {
  if (!cached || !cached.length) cached = await loadVoices();
  return cached;
}

export type VoiceWish = { voiceId?: string; presents?: Presentation; accent?: "US" | "GB"; avoid?: string[] };

/** Choose a voice: exact id → wished presentation + accent → presentation → accent → any local → any. */
export function chooseVoice(list: SpeechSynthesisVoice[], wish: VoiceWish = {}): SpeechSynthesisVoice | undefined {
  const pool = list.filter((v) => !wish.avoid?.includes(v.voiceURI));
  const from = pool.length ? pool : list;
  const by = (f: (v: SpeechSynthesisVoice) => boolean) => from.filter(f).sort((a, b) => Number(b.localService) - Number(a.localService))[0];
  return (
    (wish.voiceId ? from.find((v) => v.voiceURI === wish.voiceId) : undefined) ??
    (wish.presents && wish.accent ? by((v) => presentationOf(v.name) === wish.presents && accentOf(v.lang) === wish.accent) : undefined) ??
    (wish.presents ? by((v) => presentationOf(v.name) === wish.presents) : undefined) ??
    (wish.accent ? by((v) => accentOf(v.lang) === wish.accent) : undefined) ??
    by((v) => /en-(US|GB)/i.test(v.lang.replace("_", "-"))) ??
    from[0]
  );
}

export const RATES = { slow: 0.72, normal: 0.95 } as const;
export type Speed = keyof typeof RATES;

let speaking = 0;

/** Speak one utterance and resolve when it ends (or fails). Long text is split by sentence (Chrome cuts off ~15 s). */
export async function speak(text: string, opts: VoiceWish & { speed?: Speed; rate?: number; cancel?: boolean } = {}): Promise<boolean> {
  if (!speechAvailable()) return false;
  const list = await voices();
  const voice = chooseVoice(list, opts);
  const synth = window.speechSynthesis;
  if (opts.cancel !== false) synth.cancel();
  const token = ++speaking;
  const parts = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  for (const part of parts) {
    if (token !== speaking) return false;
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(part.trim());
      u.lang = voice?.lang ?? "en-US";
      if (voice) u.voice = voice;
      u.rate = opts.rate ?? RATES[opts.speed ?? "normal"];
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
      // Safety net: some engines never fire onend.
      setTimeout(resolve, 600 + part.length * 90);
    });
  }
  return true;
}

export function stopSpeaking() {
  speaking++;
  if (speechAvailable()) window.speechSynthesis.cancel();
}

export type Line = { speaker: string | null; text: string };

/** "A: Hello. B: Hi!" or one line per speaker → lines. Plain text → one line with no speaker. */
export function parseDialogue(text: string): Line[] {
  const re = /(?:^|\n|\s)([A-Z][A-Za-z]{0,15}):\s/g;
  const marks = [...text.matchAll(re)];
  if (marks.length < 2) return [{ speaker: null, text: text.trim() }];
  return marks.map((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index! : text.length;
    return { speaker: m[1], text: text.slice(start, end).trim() };
  });
}

/**
 * Give each speaker a distinct, consistent voice. Speakers can carry a wish (from authored characters);
 * otherwise we alternate presentations so two speakers sound different when the device allows it.
 */
export function castVoices(list: SpeechSynthesisVoice[], speakers: string[], wishes: Record<string, VoiceWish> = {}): Map<string, SpeechSynthesisVoice | undefined> {
  const cast = new Map<string, SpeechSynthesisVoice | undefined>();
  const used: string[] = [];
  speakers.forEach((s, i) => {
    const wish = wishes[s] ?? { presents: (i % 2 === 0 ? "female" : "male") as Presentation };
    const v = chooseVoice(list, { ...wish, avoid: used });
    if (v) used.push(v.voiceURI);
    cast.set(s, v);
  });
  return cast;
}

/** Speak a dialogue line by line with one voice per speaker. */
export async function speakDialogue(text: string, opts: { voiceId?: string; speed?: Speed; wishes?: Record<string, VoiceWish>; onLine?: (i: number) => void } = {}): Promise<boolean> {
  if (!speechAvailable()) return false;
  const lines = parseDialogue(text);
  if (lines.length === 1 && !lines[0].speaker) return speak(text, { voiceId: opts.voiceId, speed: opts.speed });
  const list = await voices();
  const speakers = [...new Set(lines.map((l) => l.speaker!))];
  const cast = castVoices(list, speakers, opts.wishes);
  window.speechSynthesis.cancel();
  const token = ++speaking;
  for (const [i, line] of lines.entries()) {
    if (token !== speaking) return false;
    opts.onLine?.(i);
    const v = cast.get(line.speaker!);
    await speak(line.text, { voiceId: v?.voiceURI, speed: opts.speed, cancel: false });
    speaking = token; // speak() bumps the counter; keep this dialogue current.
  }
  return true;
}
