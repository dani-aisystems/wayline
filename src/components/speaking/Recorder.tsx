import { useEffect, useId, useRef, useState } from "react";
import { closeMic, listMics, meter, micSupported, openMic, record, type MicError } from "../../lib/mic";
import { installLocal, recognitionSupport, recognizeOnce, type RecognitionResult, type RecognitionSupport } from "../../lib/recognition";
import { useProfile } from "../../state/profile";
import type { StringKey } from "../../i18n/strings";
import "./speaking.css";

export type Take = { url: string; ms: number; transcript: string | null; recognition: RecognitionResult | null };

type Phase =
  | { kind: "off" }
  | { kind: "asking" }
  | { kind: "error"; error: MicError | "empty" | "failed" }
  | { kind: "ready" }
  | { kind: "recording" }
  | { kind: "processing" };

/**
 * Microphone panel. States are explicit so the UI never says "Recording…" unless MediaRecorder actually started.
 * Recognition runs alongside the recording only when it's on-device, or when the learner has agreed to cloud recognition.
 */
export function Recorder({ onTake, onSkip, compact = false }: { onTake: (t: Take) => void; onSkip: () => void; compact?: boolean }) {
  const { t, profile, update } = useProfile();
  const [phase, setPhase] = useState<Phase>({ kind: "off" });
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  const [level, setLevel] = useState(0);
  const [support, setSupport] = useState<RecognitionSupport | null>(null);
  const [wantCheck, setWantCheck] = useState(true);
  const stream = useRef<MediaStream | null>(null);
  const stopMeter = useRef<() => void>(() => {});
  const stopRec = useRef<() => void>(() => {});
  const stopRecog = useRef<() => void>(() => {});
  const urls = useRef<string[]>([]);
  const ids = { device: useId(), consent: useId() };

  useEffect(() => {
    void recognitionSupport().then(setSupport);
    return () => {
      stopMeter.current();
      stopRec.current();
      stopRecog.current();
      closeMic(stream.current);
      // Recordings live only for this exercise.
      for (const u of urls.current) URL.revokeObjectURL(u);
    };
  }, []);

  const start = async (deviceId = profile?.micDeviceId) => {
    setPhase({ kind: "asking" });
    stopMeter.current();
    closeMic(stream.current);
    const res = await openMic(deviceId);
    if ("error" in res) {
      setPhase({ kind: "error", error: res.error });
      return;
    }
    stream.current = res.stream;
    stopMeter.current = meter(res.stream, setLevel);
    setDevices(await listMics());
    setPhase({ kind: "ready" });
  };

  const recognitionAllowed = support === "local" || (support === "cloud" && !!profile?.recognitionConsent);

  const begin = () => {
    if (!stream.current) return;
    const r = record(stream.current);
    stopRec.current = r.stop;
    let recog: Promise<RecognitionResult> | null = null;
    if (wantCheck && recognitionAllowed) {
      const s = recognizeOnce({ local: support === "local", timeoutMs: 30_000 });
      stopRecog.current = s.stop;
      recog = s.result;
    }
    setPhase({ kind: "recording" });
    void r.done.then(async (out) => {
      if ("error" in out) {
        stopRecog.current();
        setPhase({ kind: "error", error: out.error });
        return;
      }
      setPhase({ kind: "processing" });
      urls.current.push(out.url);
      const rec = recog ? await recog : null;
      setPhase({ kind: "ready" });
      onTake({ url: out.url, ms: out.ms, transcript: rec && rec.ok ? rec.transcript : null, recognition: rec });
    });
  };

  const stop = () => {
    stopRec.current();
    stopRecog.current();
  };

  if (!micSupported()) {
    return (
      <div className="rec rec-unsupported">
        <p>{t("mic.err.unsupported")}</p>
        <button type="button" className="btn btn-quiet" onClick={onSkip}>{t("mic.manual")}</button>
      </div>
    );
  }

  return (
    <div className={`rec${compact ? " rec-compact" : ""}`}>
      {phase.kind === "off" && (
        <div className="rec-row">
          <button type="button" className="btn btn-primary" onClick={() => start()}>{t("mic.enable")}</button>
          <button type="button" className="btn btn-quiet" onClick={onSkip}>{t("mic.manual")}</button>
        </div>
      )}
      {phase.kind === "asking" && <p role="status">{t("mic.asking")}</p>}
      {phase.kind === "error" && (
        <div className="rec-error" role="alert">
          <p>{t(`mic.err.${phase.error}` as StringKey)}</p>
          <div className="rec-row">
            {phase.error !== "unsupported" && phase.error !== "insecure" && (
              <button type="button" className="btn btn-quiet" onClick={() => start()}>{t("mic.retry")}</button>
            )}
            <button type="button" className="btn btn-quiet" onClick={onSkip}>{t("mic.manual")}</button>
          </div>
        </div>
      )}
      {(phase.kind === "ready" || phase.kind === "recording" || phase.kind === "processing") && (
        <>
          <div className="rec-row">
            {phase.kind === "recording" ? (
              <button type="button" className="btn btn-danger-solid rec-btn" onClick={stop} aria-describedby={`${ids.device}-live`}>
                <span className="rec-dot" aria-hidden="true" /> {t("mic.stop")}
              </button>
            ) : (
              <button type="button" className="btn btn-primary rec-btn" onClick={begin} disabled={phase.kind === "processing"}>
                {t("mic.record")}
              </button>
            )}
            <span className="rec-meter" aria-hidden="true">
              <span className="rec-meter-fill" style={{ transform: `scaleX(${level})` }} />
            </span>
            <span id={`${ids.device}-live`} className="rec-status" role="status">
              {phase.kind === "recording" ? t("mic.recording") : phase.kind === "processing" ? "…" : t("mic.ready")}
            </span>
          </div>
          {devices.length > 1 && !compact && (
            <div className="rec-row">
              <label htmlFor={ids.device} className="setting-hint">{t("mic.device")}</label>
              <select
                id={ids.device}
                className="rec-select"
                value={profile?.micDeviceId ?? ""}
                onChange={async (e) => {
                  await update({ micDeviceId: e.target.value || undefined });
                  await start(e.target.value || undefined);
                }}
              >
                {devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
          )}
          {!compact && <RecognitionChoice support={support} want={wantCheck} setWant={setWantCheck} consentId={ids.consent} onInstalled={() => setSupport("local")} />}
          <p className="rec-privacy">{t("mic.privacy")}</p>
        </>
      )}
    </div>
  );
}

function RecognitionChoice({ support, want, setWant, consentId, onInstalled }: { support: RecognitionSupport | null; want: boolean; setWant: (v: boolean) => void; consentId: string; onInstalled: () => void }) {
  const { t, profile, update } = useProfile();
  if (support === null) return null;
  if (support === "none") return <p className="rec-note">{t("rec.none")}</p>;
  return (
    <div className="rec-recog">
      <label className="rec-check">
        <input type="checkbox" checked={want} onChange={(e) => setWant(e.target.checked)} /> {t("rec.title")}
      </label>
      {want && support === "local" && <p className="rec-note">{t("rec.local")}</p>}
      {want && support === "local-downloadable" && (
        <p className="rec-note">
          {t("rec.downloadable")}{" "}
          <button type="button" className="btn btn-quiet btn-small" onClick={async () => (await installLocal()) && onInstalled()}>{t("rec.download")}</button>
        </p>
      )}
      {want && support === "cloud" && (
        <div className="rec-note">
          <p>{t("rec.cloud")}</p>
          <label className="rec-check" htmlFor={consentId}>
            <input id={consentId} type="checkbox" checked={!!profile?.recognitionConsent} onChange={(e) => update({ recognitionConsent: e.target.checked })} />
            {t("rec.consent")}
          </label>
        </div>
      )}
    </div>
  );
}
