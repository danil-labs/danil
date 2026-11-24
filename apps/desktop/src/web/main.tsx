import "../../../../packages/ui/src/styles/global.css";
import "../lib/sharedClock";
import { billingEntry } from "./billing-route";
import { phoneRoute } from "./phone";
import { watchPreloadErrors } from "./stale-reload";

declare const __DANIL_WEB_API__: import("../../../../packages/session/src/session-config").WebSessionDeployment;
/** La compilación publica la versión del teléfono en `<base>m/` (`DANIL_WEB_PHONE=1`, `web-mobile.mjs`). */
declare const __DANIL_WEB_PHONE__: boolean;

watchPreloadErrors();

const phone = __DANIL_WEB_PHONE__ ? phoneRoute(window.location, import.meta.env.BASE_URL, window) : null;
const billing = billingEntry(window.location, sessionStorage);
if (billing && billing.href !== window.location.href) window.location.replace(billing.href);
else if (billing) {
  const root = document.getElementById("root") as HTMLElement;
  void import("./BillingPage").then(m => m.startBilling(__DANIL_WEB_API__, root));
}
else if (phone) window.location.replace(phone);
else {
  document.querySelector("link[data-app-preload]")?.setAttribute("rel", "modulepreload");
  const root = document.getElementById("root") as HTMLElement;
  void import("../../../../packages/session/src/window-session").then(m => m.startWindow(__DANIL_WEB_API__, root));
}
