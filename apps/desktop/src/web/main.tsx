import "../styles/global.css";
import "../lib/sharedClock";
import { announceStaleTab, updateNoticeReady } from "./update-state";
import { phoneRoute } from "./phone";

declare const __DANIL_WEB_API__: import("./session-config").WebSessionDeployment;
/** La compilación publica la versión del teléfono en `<base>m/` (`DANIL_WEB_PHONE=1`, `web-mobile.mjs`). */
declare const __DANIL_WEB_PHONE__: boolean;

const RELOADED_AT = "terminus.web.reloaded-at";
window.addEventListener("vite:preloadError", (event) => {
  if (updateNoticeReady()) {
    event.preventDefault();
    announceStaleTab();
    return;
  }
  if (Date.now() - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) < 30_000) return;
  sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});


const phone = __DANIL_WEB_PHONE__ ? phoneRoute(window.location, import.meta.env.BASE_URL, window) : null;
if (phone) window.location.replace(phone);
else {
  const root = document.getElementById("root") as HTMLElement;
  void import("./window-session").then(m => m.startWindow(__DANIL_WEB_API__, root));
}
