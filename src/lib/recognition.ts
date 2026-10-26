/**
 * Speech recognition through the browser's Web Speech API.
 *
 * Privacy: Chrome's default recogniser sends audio to Google's servers; Safari uses Apple's engine.
 * Chrome 139+ (desktop) can recognise on the device with `processLocally`. We use on-device recognition
 * when it's available, and otherwise only after the learner has agreed to cloud recognition.
 */
type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SRCtor = (new () => SR) & {
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
};

function ctor(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type RecognitionSupport = "local" | "local-downloadable" | "cloud" | "none";

/** What this browser offers. "cloud" means audio leaves the device. */
export async function recognitionSupport(lang = "en-US"): Promise<RecognitionSupport> {
  const C = ctor();
  if (!C) return "none";
  if (typeof C.available === "function") {
    try {
      const a = await C.available({ langs: [lang], processLocally: true });
      if (a === "available") return "local";
      if (a === "downloadable" || a === "downloading") return "local-downloadable";
    } catch {
      /* fall through to cloud */
    }
  }
  return "cloud";
}

/** Download the on-device language pack (Chrome). Must follow a user action. */
export async function installLocal(lang = "en-US"): Promise<boolean> {
  const C = ctor();
  try {
    return (await C?.install?.({ langs: [lang], processLocally: true })) ?? false;
  } catch {
    return false;
  }
}

export type RecognitionResult = { ok: true; transcript: string; alternatives: string[] } | { ok: false; error: "no-speech" | "denied" | "network" | "aborted" | "unsupported" | "failed" };

/** Listen once. `local` must be true unless the learner agreed to cloud recognition. */
export function recognizeOnce(opts: { lang?: string; local: boolean; timeoutMs?: number }): { stop: () => void; result: Promise<RecognitionResult> } {
  const C = ctor();
  if (!C) return { stop: () => {}, result: Promise.resolve({ ok: false, error: "unsupported" }) };
  const r = new C();
  r.lang = opts.lang ?? "en-US";
  r.interimResults = false;
  r.maxAlternatives = 3;
  r.continuous = false;
  if (opts.local) r.processLocally = true;
  let settled = false;
  const result = new Promise<RecognitionResult>((resolve) => {
    const finish = (v: RecognitionResult) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    r.onresult = (e) => {
      const alts = Array.from(e.results[0] ?? []).map((a) => a.transcript.trim()).filter(Boolean);
      finish(alts.length ? { ok: true, transcript: alts[0], alternatives: alts.slice(1) } : { ok: false, error: "no-speech" });
    };
    r.onerror = (e) => {
      const map: Record<string, RecognitionResult & { ok: false }> = {
        "no-speech": { ok: false, error: "no-speech" },
        "not-allowed": { ok: false, error: "denied" },
        "service-not-allowed": { ok: false, error: "denied" },
        network: { ok: false, error: "network" },
        aborted: { ok: false, error: "aborted" },
        "language-not-supported": { ok: false, error: "unsupported" },
      };
      finish(map[e.error] ?? { ok: false, error: "failed" });
    };
    r.onend = () => finish({ ok: false, error: "no-speech" });
    setTimeout(() => {
      try { r.stop(); } catch { /* already stopped */ }
    }, opts.timeoutMs ?? 12_000);
  });
  try {
    r.start();
  } catch {
    return { stop: () => {}, result: Promise.resolve({ ok: false, error: "failed" }) };
  }
  return { stop: () => { try { r.stop(); } catch { /* noop */ } }, result };
}
