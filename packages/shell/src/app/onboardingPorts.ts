import { enchufarPuertosDelAlta } from "../../../features/onboarding/src/model/ports";
import { createDanilSession } from "../../../features/settings/src/components/danil-session";
import { requestAccessInBrowser, TerminusLicense } from "../../../features/settings/src/screens/TerminusLicense";
import { Consentir } from "../../../features/settings/src/components/FreeRouterConsentDialog";
import { DialogoDeConexion } from "../../../features/settings/src/components/LoginDialog";

/** Lo de settings que usa el alta: es de settings y el shell lo enchufa (R3). */
export function enchufarAlta() {
  enchufarPuertosDelAlta({ createDanilSession, requestAccessInBrowser, TerminusLicense, Consentir, DialogoDeConexion });
}
