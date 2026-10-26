/**
 * Microphone access, level metering and recording. Recordings stay in memory as blob URLs and are
 * discarded when the exercise ends; nothing is uploaded or stored.
 */
export type MicError = "unsupported" | "insecure" | "denied" | "not-found" | "busy" | "unknown";

export function micSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== "undefined";
}

export function classifyMicError(e: unknown): MicError {
  const name = (e as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "not-found";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "unknown";
}

/** Ask for the microphone. Must be called from a user action (a click). */
export async function openMic(deviceId?: string): Promise<{ stream: MediaStream } | { error: MicError }> {
  if (typeof window !== "undefined" && !window.isSecureContext) return { error: "insecure" };
  if (!micSupported()) return { error: "unsupported" };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true },
    });
    return { stream };
  } catch (e) {
    return { error: classifyMicError(e) };
  }
}

/** Input devices. Labels are only available after permission has been granted once. */
export async function listMics(): Promise<{ id: string; label: string }[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}

export function closeMic(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Live input level 0–1 for a meter. Returns a stop function. */
export function meter(stream: MediaStream, onLevel: (level: number) => void): () => void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(raf);
    src.disconnect();
    void ctx.close();
  };
}

/** Record from a stream until stop() is called. Resolves to a blob URL the caller must revoke. */
export function record(stream: MediaStream, maxMs = 30_000): { stop: () => void; done: Promise<{ url: string; ms: number } | { error: "empty" | "failed" }> } {
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream);
  } catch {
    return { stop: () => {}, done: Promise.resolve({ error: "failed" as const }) };
  }
  const chunks: Blob[] = [];
  const started = Date.now();
  const done = new Promise<{ url: string; ms: number } | { error: "empty" | "failed" }>((resolve) => {
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onerror = () => resolve({ error: "failed" });
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (!blob.size) resolve({ error: "empty" });
      else resolve({ url: URL.createObjectURL(blob), ms: Date.now() - started });
    };
  });
  rec.start(250);
  const timer = setTimeout(() => rec.state === "recording" && rec.stop(), maxMs);
  return {
    stop: () => {
      clearTimeout(timer);
      if (rec.state === "recording") rec.stop();
    },
    done,
  };
}
