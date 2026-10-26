import { NavLink, Outlet } from "react-router-dom";
import { useProfile } from "../state/profile";
import { Wordmark } from "../components/Logo";
import type { StringKey } from "../i18n/strings";
import "./shell.css";

const NAV: { to: string; label: StringKey; icon: string }[] = [
  { to: "/today", label: "nav.today", icon: "M4 12h4l3-8 3 16 3-8h3" },
  { to: "/review", label: "nav.review", icon: "M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" },
  { to: "/library", label: "nav.library", icon: "M5 4h4v16H5zM10 4h4v16h-4zM15.5 5l3.5-1 2.5 15.5-3.5 1z" },
  { to: "/settings", label: "nav.settings", icon: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" },
];

export function Shell() {
  const { t } = useProfile();
  return (
    <div className="shell">
      <a className="skip-link" href="#main">{t("app.skip")}</a>
      <header className="shell-top">
        <NavLink to="/today" className="shell-brand" aria-label="Wayline">
          <Wordmark height={26} />
        </NavLink>
        <nav className="shell-nav" aria-label={t("nav.main")}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className="shell-link">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                <path d={n.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{t(n.label)}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main" className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
