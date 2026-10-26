import { useRegisterSW } from "virtual:pwa-register/react";
import { useProfile } from "../state/profile";

/** Asks before updating, so a new version never reloads the page in the middle of a lesson. */
export function UpdatePrompt() {
  const { t } = useProfile();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="toast" role="status">
      <p>{t("update.ready")}</p>
      <button type="button" className="btn btn-primary btn-small" onClick={() => updateServiceWorker(true)}>{t("update.reload")}</button>
      <button type="button" className="btn btn-quiet btn-small" onClick={() => setNeedRefresh(false)}>{t("common.dismiss")}</button>
    </div>
  );
}
