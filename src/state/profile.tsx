import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { db, type Profile } from "../db/db";
import { translate, SUPPORTED_LANGUAGES, type StringKey, type UiLanguage } from "../i18n/strings";

type Status = "loading" | "ready" | "unavailable";

type ProfileContextValue = {
  status: Status;
  profile: Profile | null;
  lang: UiLanguage;
  t: (key: StringKey, vars?: Record<string, string>) => string;
  update: (patch: Partial<Omit<Profile, "id" | "createdAt">>) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

/** Before the learner chooses, guess from the browser: Bulgarian if the device is Bulgarian, else English. */
function guessLanguage(): UiLanguage {
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const p of prefs) {
    const base = p.toLowerCase().split("-")[0] as UiLanguage;
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(base)) return base;
  }
  return "en";
}

function applyTheme(theme: Profile["theme"]) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let alive = true;
    db.profile
      .get("me")
      .then((p) => {
        if (!alive) return;
        setProfile(p ?? null);
        if (p) applyTheme(p.theme);
        setStatus("ready");
      })
      .catch(() => alive && setStatus("unavailable"));
    return () => {
      alive = false;
    };
  }, []);

  const lang = profile?.explanationLanguage ?? guessLanguage();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const update = useCallback<ProfileContextValue["update"]>(async (patch) => {
    const current = (await db.profile.get("me")) ?? {
      id: "me" as const,
      createdAt: new Date().toISOString(),
      explanationLanguage: guessLanguage(),
      theme: "system" as const,
      interests: [],
      seenNotes: [],
    };
    const next: Profile = { ...current, ...patch };
    await db.profile.put(next);
    applyTheme(next.theme);
    setProfile(next);
  }, []);

  const value = useMemo<ProfileContextValue>(
    () => ({ status, profile, lang, t: (key, vars) => translate(lang, key, vars), update }),
    [status, profile, lang, update],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
