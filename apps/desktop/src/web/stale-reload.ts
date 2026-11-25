import { announceStaleTab, updateNoticeReady } from "./update-state";

const RELOADED_AT = "terminus.web.reloaded-at";

/** Una pestaña con el bundle viejo se recarga sola una vez; con el aviso listo, solo avisa. */
export function watchPreloadErrors() {
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
}
