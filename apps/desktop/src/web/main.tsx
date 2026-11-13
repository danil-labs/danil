import "../styles/global.css";
import "../lib/sharedClock";
import { announceStaleTab, updateNoticeReady } from "./update-state";

declare const __DANIL_WEB_API__: import("./session-config").WebSessionDeployment;

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


const root = document.getElementById("root") as HTMLElement;
void import("./window-session").then(m => m.startWindow(__DANIL_WEB_API__, root));
