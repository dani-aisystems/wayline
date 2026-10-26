/**
 * English text-to-speech using the device's own voices (Web Speech API).
 * Local voices work offline; network voices are marked so the learner can choose.
 */
export type VoiceOption = { id: string; name: string; lang: string; local: boolean };

const ENGLISH = /^en([-_](US|GB|AU|CA|IE|NZ|ZA|IN))?$/i;

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

/** Voices load asynchronously in Chrome and need polling in Safari. */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!speechAvailable()) return Promise.resolve([]);
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const done = () => resolve(synth.getVoices().filter((v) => ENGLISH.test(v.lang.replace("_", "-"))));
    if (synth.getVoices().length) return done();
    const start = Date.now();
    const poll = window.setInterval(() => {
      if (synth.getVoices().length || Date.now() - start > timeoutMs) {
        window.clearInterval(poll);
        done();
      }
    }, 100);
    synth.addEventListener?.("voiceschanged", () => {
      window.clearInterval(poll);
      done();
    }, { once: true });
  });
}

export function toOption(v: SpeechSynthesisVoice): VoiceOption {
  return { id: v.voiceURI, name: v.name, lang: v.lang.replace("_", "-"), local: v.localService };
}

/** Prefer the learner's choice, then a local US/GB voice, then any English voice. */
export function pickVoice(voices: SpeechSynthesisVoice[], preferred?: string): SpeechSynthesisVoice | undefined {
  return (
    voices.find((v) => v.voiceURI === preferred) ??
    voices.find((v) => v.localService && /en-(US|GB)/i.test(v.lang.replace("_", "-"))) ??
    voices.find((v) => v.localService) ??
    voices[0]
  );
}

let cached: SpeechSynthesisVoice[] | null = null;

/** Speak sentence by sentence (Chrome cuts long utterances at ~15 s). */
export async function speak(text: string, opts: { voiceId?: string; rate?: number } = {}): Promise<boolean> {
  if (!speechAvailable()) return false;
  cached ??= await loadVoices();
  const voice = pickVoice(cached, opts.voiceId);
  const synth = window.speechSynthesis;
  synth.cancel();
  const parts = text.match(/[^.!?]+[.!?]*/g) ?? [text];
  for (const part of parts) {
    const u = new SpeechSynthesisUtterance(part.trim());
    u.lang = voice?.lang ?? "en-US";
    if (voice) u.voice = voice;
    u.rate = opts.rate ?? 0.92;
    synth.speak(u);
  }
  return true;
}
