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


const query = new URLSearchParams(window.location.search);
const root = document.getElementById("root") as HTMLElement;
if (query.get("demo") === "1") {
  const admin = window.location.pathname.replace(/\/+$/, "") === `${import.meta.env.BASE_URL}admin`;
  if (admin) void import("./admin/main").then(m => m.startAdminDemo({ dark: query.get("theme") === "dark" }));
  else void import("./attention/main").then(m => m.startAttention({ login: `${import.meta.env.BASE_URL}auth` }));
} else void import("./PlatformEntry").then(m => m.startPlatform(__DANIL_WEB_API__, root));
