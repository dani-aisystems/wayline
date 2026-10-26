import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChartHero } from "../components/ChartHero";
import { Wordmark } from "../components/Logo";
import { useProfile } from "../state/profile";
import { LANGUAGE_NAMES, LANGUAGE_NAME_IN, SUPPORTED_LANGUAGES, type UiLanguage } from "../i18n/strings";
import type { Profile } from "../db/db";
import "./welcome.css";

export function Welcome() {
  const { t, lang, profile, update, status } = useProfile();
  // Until the learner picks, follow the saved or guessed language (which may load after first render).
  const [picked, setPicked] = useState<UiLanguage | null>(null);
  const choice = picked ?? lang;
  const [saved, setSaved] = useState(false);
  const groupId = useId();

  const navigate = useNavigate();
  const save = async () => {
    await update({ explanationLanguage: choice });
    setSaved(true);
    navigate(profile?.onboardedAt ? "/today" : "/start");
  };

  return (
    <div className="welcome">
      <a className="skip-link" href="#main">{t("app.skip")}</a>
      <header className="welcome-bar">
        <Wordmark height={30} />
        <ThemePicker value={profile?.theme ?? "system"} onChange={(theme) => update({ theme })} />
      </header>

      <main id="main" className="welcome-main">
        <section className="welcome-intro">
          <h1 className="welcome-title">{t("app.tagline")}</h1>
          <p className="welcome-lead">{t("home.lead")}</p>
        </section>

        <div className="welcome-art">
          <ChartHero />
        </div>

        <section className="welcome-choice" aria-labelledby={`${groupId}-q`}>
          {status === "unavailable" ? (
            <p role="alert" className="notice notice-bad">{t("error.storage")}</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <fieldset className="lang-set">
                <legend id={`${groupId}-q`} className="lang-question">{t("lang.question")}</legend>
                <p className="lang-hint">{t("lang.hint")}</p>
                <div className="lang-options">
                  {SUPPORTED_LANGUAGES.map((code) => (
                    <label key={code} className="lang-option" data-checked={choice === code}>
                      <input
                        type="radio"
                        name="explanationLanguage"
                        value={code}
                        checked={choice === code}
                        onChange={() => {
                          setPicked(code);
                          setSaved(false);
                        }}
                      />
                      <span className="lang-native" lang={code}>
                        {code === "en" ? t("lang.englishOnly") : LANGUAGE_NAMES[code].native}
                      </span>
                      {code !== "en" && <span className="lang-english">{LANGUAGE_NAMES[code].english}</span>}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="welcome-actions">
                <button className="btn btn-primary" type="submit" disabled={status !== "ready"}>
                  {t("lang.continue")}
                </button>
                <p className="welcome-status" role="status" aria-live="polite">
                  {saved ? t("lang.saved", { language: LANGUAGE_NAME_IN[lang][choice] }) : t("home.stored")}
                </p>
              </div>
            </form>
          )}
          <p className="welcome-fineprint">{t("storage.notice")}</p>
        </section>
      </main>
    </div>
  );
}

function ThemePicker({ value, onChange }: { value: Profile["theme"]; onChange: (v: Profile["theme"]) => void }) {
  const { t } = useProfile();
  const id = useId();
  return (
    <div className="theme-picker">
      <label htmlFor={id} className="visually-hidden">{t("theme.label")}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as Profile["theme"])}>
        <option value="system">{t("theme.system")}</option>
        <option value="light">{t("theme.light")}</option>
        <option value="dark">{t("theme.dark")}</option>
      </select>
    </div>
  );
}
