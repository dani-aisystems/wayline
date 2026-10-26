import { useEffect, useId, useRef, useState } from "react";
import { useProfile } from "../state/profile";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type UiLanguage } from "../i18n/strings";
import { backupFileName, exportBackup, importBackup } from "../db/backup";
import { db, requestPersistence, type Profile } from "../db/db";
import { loadVoices, speak, toOption, type VoiceOption } from "../lib/speech";
import { relativeDay } from "../lib/time";
import "./settings.css";

export function Settings() {
  const { t, lang, profile, update } = useProfile();
  const [message, setMessage] = useState<{ kind: "good" | "bad"; text: string } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ kind: "restore"; text: string } | { kind: "reset" } | null>(null);
  const [pasted, setPasted] = useState("");
  const ids = { lang: useId(), time: useId(), theme: useId(), voice: useId() };

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    void loadVoices().then((v) => setVoices(v.map(toOption)));
  }, []);

  useEffect(() => {
    if (location.hash === "#backup") document.getElementById("backup")?.scrollIntoView();
  }, []);

  if (!profile) return <div className="page" aria-busy="true" />;

  const download = async () => {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFileName();
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await update({ lastBackupAt: new Date().toISOString() });
  };

  // Reload so every screen reads the new data. The artifact build keeps routes in memory, so a reload is enough there.
  const restart = (path: string) => (__ARTIFACT__ ? location.reload() : location.assign(path));

  const copyBackup = async () => {
    const text = JSON.stringify(await exportBackup());
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ kind: "good", text: t("settings.copied") });
      await update({ lastBackupAt: new Date().toISOString() });
    } catch {
      setMessage({ kind: "bad", text: t("settings.copyFailed") });
    }
  };

  const restore = async (text: string) => {
    setPending(null);
    const result = await importBackup(text);
    if (result.ok) {
      setMessage({ kind: "good", text: t("settings.importDone", { n: String(result.rows) }) });
      setTimeout(() => restart("/today"), 900);
    } else {
      setMessage({ kind: "bad", text: t("settings.importInvalid") });
    }
  };

  const reset = async () => {
    setPending(null);
    await db.delete();
    restart("/");
  };

  const confirmPanel = (text: string, action: string, onConfirm: () => void, danger = false) => (
    <div className="confirm" role="alertdialog" aria-label={action}>
      <p>{text}</p>
      <div className="setting-row">
        <button type="button" className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`} onClick={onConfirm}>{action}</button>
        <button type="button" className="btn btn-quiet" onClick={() => setPending(null)}>{t("common.cancel")}</button>
      </div>
    </div>
  );

  return (
    <div className="page settings">
      <h1 className="page-title">{t("settings.title")}</h1>

      {message && (
        <p className={`notice notice-${message.kind}`} role={message.kind === "bad" ? "alert" : "status"}>{message.text}</p>
      )}

      <section className="setting">
        <label htmlFor={ids.lang} className="setting-label">{t("settings.language")}</label>
        <p className="setting-hint">{t("settings.languageHint")}</p>
        <select id={ids.lang} value={profile.explanationLanguage} onChange={(e) => update({ explanationLanguage: e.target.value as UiLanguage })}>
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l} value={l}>{l === "en" ? t("lang.englishOnly") : LANGUAGE_NAMES[l].native}</option>
          ))}
        </select>
      </section>

      <section className="setting">
        <label htmlFor={ids.time} className="setting-label">{t("settings.time")}</label>
        <select id={ids.time} value={profile.dailyMinutes ?? 20} onChange={(e) => update({ dailyMinutes: Number(e.target.value) as Profile["dailyMinutes"] })}>
          {[10, 20, 30, 45].map((m) => (
            <option key={m} value={m}>{t("onb.time.minutes", { n: String(m) })} · {t(`onb.time.${m}` as never)}</option>
          ))}
        </select>
      </section>

      <section className="setting">
        <label htmlFor={ids.theme} className="setting-label">{t("settings.theme")}</label>
        <select id={ids.theme} value={profile.theme} onChange={(e) => update({ theme: e.target.value as Profile["theme"] })}>
          <option value="system">{t("theme.system")}</option>
          <option value="light">{t("theme.light")}</option>
          <option value="dark">{t("theme.dark")}</option>
        </select>
      </section>

      <section className="setting">
        <label htmlFor={ids.voice} className="setting-label">{t("settings.voice")}</label>
        <p className="setting-hint">{t("settings.voiceHint")}</p>
        {voices && voices.length === 0 ? (
          <p>{t("settings.voiceNone")}</p>
        ) : (
          <div className="setting-row">
            <select id={ids.voice} value={profile.voiceId ?? ""} onChange={(e) => update({ voiceId: e.target.value || undefined })}>
              <option value="">{t("theme.system")}</option>
              {voices?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.lang}){v.local ? ` · ${t("settings.voiceOffline")}` : ""}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-quiet" onClick={() => speak("Hello! Nice to meet you.", { voiceId: profile.voiceId })}>
              {t("settings.voiceTest")}
            </button>
          </div>
        )}
      </section>

      <section className="setting" id="backup" aria-labelledby="backup-title">
        <h2 id="backup-title" className="setting-label">{t("settings.backup")}</h2>
        <p className="setting-hint">{t("settings.backupHint")}</p>
        <p className="setting-hint">
          {profile.lastBackupAt ? t("settings.lastBackup", { when: relativeDay(new Date(profile.lastBackupAt), lang) }) : t("settings.neverBackedUp")}
        </p>
        <div className="setting-row">
          {!__ARTIFACT__ && <button type="button" className="btn btn-primary" onClick={download}>{t("settings.export")}</button>}
          <button type="button" className={`btn ${__ARTIFACT__ ? "btn-primary" : "btn-quiet"}`} onClick={copyBackup}>{t("settings.copy")}</button>
          <button type="button" className="btn btn-quiet" onClick={() => fileRef.current?.click()}>{t("settings.import")}</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="restore-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void f.text().then((text) => setPending({ kind: "restore", text }));
            }}
          />
        </div>
        <details className="paste-restore">
          <summary>{t("settings.pasteRestore")}</summary>
          <label htmlFor="paste-backup" className="visually-hidden">{t("settings.pasteRestore")}</label>
          <textarea id="paste-backup" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} spellCheck={false} />
          <button type="button" className="btn btn-quiet" disabled={!pasted.trim()} onClick={() => setPending({ kind: "restore", text: pasted })}>
            {t("settings.import")}
          </button>
        </details>
        {pending?.kind === "restore" && confirmPanel(t("settings.importConfirm"), t("settings.importAction"), () => void restore(pending.text))}
      </section>

      <section className="setting" aria-labelledby="storage-title">
        <h2 id="storage-title" className="setting-label">{t("settings.storage")}</h2>
        {persisted !== null && <p className="setting-hint">{persisted ? t("settings.persisted") : t("settings.notPersisted")}</p>}
        {persisted === false && (
          <button type="button" className="btn btn-quiet" onClick={async () => setPersisted(await requestPersistence())}>
            {t("settings.protect")}
          </button>
        )}
        <button type="button" className="btn btn-danger" onClick={() => setPending({ kind: "reset" })}>{t("settings.reset")}</button>
        {pending?.kind === "reset" && confirmPanel(t("settings.resetConfirm"), t("settings.resetAction"), () => void reset(), true)}
      </section>

      <section className="setting" aria-labelledby="about-title">
        <h2 id="about-title" className="setting-label">{t("settings.about")}</h2>
        <p className="setting-hint">{t("settings.aboutText", { version: __APP_VERSION__ })}</p>
        <p className="setting-hint">{t("settings.credits")}</p>
      </section>
    </div>
  );
}
