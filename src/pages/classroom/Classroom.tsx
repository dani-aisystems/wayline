/**
 * /klas — the opt-in classroom layer. One page; what it shows depends on who is signed in:
 * nobody → sign in / create account; student → join a class (with consent) or see their class;
 * teacher → their classes, codes and students; admin → accounts and roles.
 * Loaded lazily (see App.tsx), so learners who never open it download none of this code.
 */
import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { useProfile } from "../../state/profile";
import type { StringKey } from "../../i18n/strings";
import { classroomConfigured } from "../../classroom/supabase";
import * as api from "../../classroom/api";
import { errorKey, MIN_PASSWORD, normalizeJoinCode, validClassName, validDisplayName } from "../../classroom/rules";
import "../settings.css";
import "./classroom.css";

type Notice = { kind: "good" | "bad"; key: StringKey; vars?: Record<string, string> } | null;

/** Run an action, turning any failure into a translated message instead of an unhandled error. */
function useAction(setNotice: (n: Notice) => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (action: () => Promise<void>, overrides: Partial<Record<StringKey, StringKey>> = {}) => {
      setBusy(true);
      setNotice(null);
      try {
        await action();
      } catch (e) {
        const key = errorKey(e as never);
        setNotice({ kind: "bad", key: overrides[key] ?? key });
      } finally {
        setBusy(false);
      }
    },
    [setNotice],
  );
  return { busy, run };
}

/** Live online/offline state: the notice appears when Wi-Fi drops and clears when it returns. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function Classroom() {
  const { t } = useProfile();
  const online = useOnline();
  // undefined = still checking, null = signed out
  const [session, setSession] = useState<Session | null | undefined>(classroomConfigured ? undefined : null);
  const [me, setMe] = useState<api.Profile | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!classroomConfigured) return;
    void api.currentSession().then(setSession, () => setSession(null));
    return api.onSessionChange(setSession);
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    setMe(null);
    if (!userId) return;
    api.myProfile(userId).then(setMe, (e) => setNotice({ kind: "bad", key: errorKey(e) }));
  }, [userId]);

  let body: ReactNode;
  if (!classroomConfigured) body = <p className="notice notice-bad">{t("class.unavailable")}</p>;
  else if (session === undefined || (session && !me && !notice)) body = <p aria-busy="true">{t("class.loading")}</p>;
  else if (!session) body = <AuthForm setNotice={setNotice} />;
  else if (me) {
    body = (
      <>
        <AccountBar me={me} setNotice={setNotice} />
        {me.role === "student" && <StudentView me={me} setNotice={setNotice} />}
        {me.role === "teacher" && <TeacherView me={me} setNotice={setNotice} />}
        {me.role === "admin" && <AdminView me={me} setNotice={setNotice} />}
      </>
    );
  }

  return (
    <div className="page settings classroom">
      <p className="class-back"><Link to="/settings">← {t("settings.title")}</Link></p>
      <h1 className="page-title">{t("class.title")}</h1>
      <p className="setting-hint class-intro">{t("class.intro")}</p>
      {!online && <p className="notice notice-bad" role="status">{t("class.offline")}</p>}
      {notice && (
        <p className={`notice notice-${notice.kind}`} role={notice.kind === "bad" ? "alert" : "status"}>{t(notice.key, notice.vars)}</p>
      )}
      {body}
    </div>
  );
}

function AccountBar({ me, setNotice }: { me: api.Profile; setNotice: (n: Notice) => void }) {
  const { t } = useProfile();
  const { busy, run } = useAction(setNotice);
  return (
    <section className="setting">
      <p>
        {t("class.auth.signedInAs", { name: me.display_name })} · <span className="class-role">{t(`class.role.${me.role}`)}</span>
      </p>
      <button type="button" className="btn btn-quiet btn-small" disabled={busy} onClick={() => run(api.signOut)}>{t("class.auth.signOut")}</button>
    </section>
  );
}

function AuthForm({ setNotice }: { setNotice: (n: Notice) => void }) {
  const { t } = useProfile();
  const { busy, run } = useAction(setNotice);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const ids = { name: useId(), email: useId(), password: useId(), nameHint: useId(), passwordHint: useId() };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "signUp" && !validDisplayName(name)) return setNotice({ kind: "bad", key: "class.err.nameLength" });
    if (mode === "signUp" && password.length < MIN_PASSWORD) return setNotice({ kind: "bad", key: "class.err.weakPassword" });
    void run(async () => {
      if (mode === "signIn") return api.signIn(email, password);
      const { needsConfirmation } = await api.signUp(name, email, password);
      if (needsConfirmation) {
        setNotice({ kind: "good", key: "class.auth.checkEmail" });
        setMode("signIn");
      }
    });
  };

  return (
    <form className="setting class-form" onSubmit={submit}>
      <h2 className="setting-label">{t(mode === "signIn" ? "class.auth.signIn" : "class.auth.signUp")}</h2>
      {mode === "signUp" && (
        <div className="field">
          <label htmlFor={ids.name}>{t("class.auth.name")}</label>
          <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" required aria-describedby={ids.nameHint} />
          <p id={ids.nameHint} className="setting-hint">{t("class.auth.nameHint")}</p>
        </div>
      )}
      <div className="field">
        <label htmlFor={ids.email}>{t("class.auth.email")}</label>
        <input id={ids.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor={ids.password}>{t("class.auth.password")}</label>
        <input
          id={ids.password}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          minLength={mode === "signUp" ? MIN_PASSWORD : undefined}
          required
          aria-describedby={mode === "signUp" ? ids.passwordHint : undefined}
        />
        {mode === "signUp" && <p id={ids.passwordHint} className="setting-hint">{t("class.auth.passwordHint")}</p>}
      </div>
      <div className="setting-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>{t(mode === "signIn" ? "class.auth.signIn" : "class.auth.signUp")}</button>
        <button type="button" className="btn btn-quiet" onClick={() => { setNotice(null); setMode(mode === "signIn" ? "signUp" : "signIn"); }}>
          {t(mode === "signIn" ? "class.auth.switchToSignUp" : "class.auth.switchToSignIn")}
        </button>
      </div>
    </form>
  );
}

function StudentView({ me, setNotice }: { me: api.Profile; setNotice: (n: Notice) => void }) {
  const { t } = useProfile();
  const { busy, run } = useAction(setNotice);
  const [membership, setMembership] = useState<api.Membership | null | undefined>(undefined);
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const ids = { code: useId(), codeHint: useId(), consent: useId() };

  const load = useCallback(() => api.myMembership(me.id).then(setMembership, (e) => setNotice({ kind: "bad", key: errorKey(e) })), [me.id, setNotice]);
  useEffect(() => { void load(); }, [load]);

  if (membership === undefined) return <p aria-busy="true">{t("class.loading")}</p>;

  if (membership) {
    return (
      <section className="setting" aria-labelledby="member-title">
        <h2 id="member-title" className="setting-label">{t("class.member.title")}</h2>
        <p>{t("class.member.in", { name: membership.className })}</p>
        {!confirmLeave ? (
          <button type="button" className="btn btn-quiet" onClick={() => setConfirmLeave(true)}>{t("class.member.leave")}</button>
        ) : (
          <div className="confirm" role="alertdialog" aria-label={t("class.member.leave")}>
            <p>{t("class.member.leaveConfirm", { name: membership.className })}</p>
            <div className="setting-row">
              <button type="button" className="btn btn-danger-solid" disabled={busy} onClick={() => run(async () => {
                await api.leaveClass(me.id);
                setConfirmLeave(false);
                await load();
                setNotice({ kind: "good", key: "class.member.left" });
              })}>{t("class.member.leave")}</button>
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmLeave(false)}>{t("common.cancel")}</button>
            </div>
          </div>
        )}
      </section>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeJoinCode(code);
    if (!normalized) return setNotice({ kind: "bad", key: "class.err.badCode" });
    void run(async () => {
      const { className } = await api.joinClass(normalized);
      await load();
      setNotice({ kind: "good", key: "class.join.done", vars: { name: className } });
    }, { "class.err.denied": "class.err.notStudent" });
  };

  return (
    <form className="setting class-form" onSubmit={submit} aria-labelledby="join-title">
      <h2 id="join-title" className="setting-label">{t("class.join.title")}</h2>
      <div className="field">
        <label htmlFor={ids.code}>{t("class.join.code")}</label>
        <input
          id={ids.code}
          className="class-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={8}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          aria-describedby={ids.codeHint}
        />
        <p id={ids.codeHint} className="setting-hint">{t("class.join.codeHint")}</p>
      </div>

      {/* The consent screen: exactly what is shared, before anything is. */}
      <div className="class-consent">
        <h3 className="setting-label">{t("class.join.consentTitle")}</h3>
        <ul>
          <li>{t("class.join.shared1")}</li>
          <li>{t("class.join.shared2")}</li>
          <li>{t("class.join.shared3")}</li>
          <li>{t("class.join.shared4")}</li>
        </ul>
        <p>{t("class.join.notShared")}</p>
        <p className="setting-hint">{t("class.join.storage")}</p>
        <p className="setting-hint">{t("class.join.age")}</p>
        <label className="class-check" htmlFor={ids.consent}>
          <input id={ids.consent} type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          {t("class.join.consent")}
        </label>
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy || !agreed}>{t("class.join.submit")}</button>
    </form>
  );
}

function TeacherView({ me, setNotice }: { me: api.Profile; setNotice: (n: Notice) => void }) {
  const { t } = useProfile();
  const { busy, run } = useAction(setNotice);
  const [classes, setClasses] = useState<api.TeacherClass[] | null>(null);
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState<{ student: api.ClassStudent; className: string } | null>(null);
  const ids = { name: useId(), nameHint: useId() };

  const load = useCallback(() => api.teacherClasses(me.id).then(setClasses, (e) => setNotice({ kind: "bad", key: errorKey(e) })), [me.id, setNotice]);
  useEffect(() => { void load(); }, [load]);

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!validClassName(name)) return setNotice({ kind: "bad", key: "class.err.classNameLength" });
    void run(async () => {
      await api.createClass(name);
      setName("");
      await load();
    });
  };

  return (
    <>
      <section className="setting" aria-labelledby="classes-title">
        <h2 id="classes-title" className="setting-label">{t("class.teacher.title")}</h2>
        {classes === null && <p aria-busy="true">{t("class.loading")}</p>}
        {classes?.length === 0 && <p className="setting-hint">{t("class.teacher.none")}</p>}
        {classes?.map((c) => (
          <article key={c.id} className="class-card" aria-labelledby={`class-${c.id}`}>
            <h3 id={`class-${c.id}`}>{c.name}</h3>
            <p className="class-code">{t("class.teacher.code", { code: c.join_code })}</p>
            <p className="setting-hint">{t("class.teacher.codeHint")}</p>
            <h4>{t("class.teacher.students", { n: String(c.students.length) })}</h4>
            {c.students.length === 0 ? (
              <p className="setting-hint">{t("class.teacher.noStudents")}</p>
            ) : (
              <ul className="class-students">
                {c.students.map((s) => (
                  <li key={s.student_id}>
                    <span>{s.display_name}</span>
                    <button type="button" className="btn btn-quiet btn-small" onClick={() => setRemoving({ student: s, className: c.name })}>{t("class.teacher.remove")}</button>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
        {removing && (
          <div className="confirm" role="alertdialog" aria-label={t("class.teacher.remove")}>
            <p>{t("class.teacher.removeConfirm", { name: removing.student.display_name, class: removing.className })}</p>
            <div className="setting-row">
              <button type="button" className="btn btn-danger-solid" disabled={busy} onClick={() => run(async () => {
                await api.removeStudent(removing.student.student_id);
                setRemoving(null);
                await load();
              })}>{t("class.teacher.remove")}</button>
              <button type="button" className="btn btn-quiet" onClick={() => setRemoving(null)}>{t("common.cancel")}</button>
            </div>
          </div>
        )}
      </section>

      <form className="setting class-form" onSubmit={create}>
        <div className="field">
          <label htmlFor={ids.name}>{t("class.teacher.newName")}</label>
          <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required aria-describedby={ids.nameHint} />
          <p id={ids.nameHint} className="setting-hint">{t("class.teacher.newNameHint")}</p>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>{t("class.teacher.create")}</button>
      </form>
    </>
  );
}

function AdminView({ me, setNotice }: { me: api.Profile; setNotice: (n: Notice) => void }) {
  const { t } = useProfile();
  const { busy, run } = useAction(setNotice);
  const [people, setPeople] = useState<api.Profile[] | null>(null);

  const load = useCallback(() => api.allProfiles().then(setPeople, (e) => setNotice({ kind: "bad", key: errorKey(e) })), [setNotice]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="setting" aria-labelledby="admin-title">
      <h2 id="admin-title" className="setting-label">{t("class.admin.title")}</h2>
      <p className="setting-hint">{t("class.admin.hint")}</p>
      {people === null && <p aria-busy="true">{t("class.loading")}</p>}
      <ul className="class-students">
        {people?.map((p) => (
          <li key={p.id}>
            <span>
              {p.display_name}{p.id === me.id ? ` (${t("class.admin.you")})` : ""} · <span className="class-role">{t(`class.role.${p.role}`)}</span>
            </span>
            {p.id !== me.id && p.role !== "admin" && (
              <button
                type="button"
                className="btn btn-quiet btn-small"
                disabled={busy}
                onClick={() => run(async () => {
                  await api.setRole(p.id, p.role === "teacher" ? "student" : "teacher");
                  await load();
                })}
              >
                {t(p.role === "teacher" ? "class.admin.makeStudent" : "class.admin.makeTeacher")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
