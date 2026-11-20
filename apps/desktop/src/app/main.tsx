/* @refresh reload */
// Antes que nada: sin los catálogos dentro, `t()` devuelve la clave.
import "../locales/catalogs";
import { render } from "solid-js/web";
import App from "./App";
import Setup from "../features/settings/Setup";
import Lanzador from "../features/shell/Launcher";
import { invoke } from "../lib/invoke.ts";
import { seguirElTema } from "../lib/theme";
import { aplicarEscala, atajoDeEscala } from "../lib/zoom";
import { trimNativeMenu } from "../lib/contextMenu";
import { acotarSeleccionarTodo } from "../lib/selectAll";
import { activarBarrasAlDesplazar } from "../lib/scrollbars";
import { aplicarVeloDePestanas } from "../lib/chat-background-store";
import { aplicarLengua, refreshLanguage, lenguasDisponibles, semillaDelAlta } from "../lib/i18n";
import { cargarPaquetes } from "../locales/packs";
import { mountAfterLanguagePacks } from "../locales/startup";
import { capabilities, setCapabilities } from "../lib/platform";
import { askGuestChannels } from "../features/machines/guestChannels";
import "../lib/sharedClock";
// Errores y avisos de encargado se leen al fallar algo, ya con la ventana montada: entran por detrás.
// Si el trozo no carga, caen a la prosa del motor; el panel de encargados lo vuelve a pedir.
void import("../locales/failurePhrases").catch((e) => console.warn("[lenguas] failurePhrases", e));

// Los canales de máquinas locales los dice la ventana (`guest_channels`), no el userAgent.
// La web también carga este archivo: ahí `invoke` va por el relay y despertaría la máquina.
if (capabilities().nativeWindow) {
  // El selector de organización de Desk, por el borde; oculto hasta que la ruta exista.
  // Fuera de la carga inicial: el módulo llega con el primer pintado del menú de la cuenta.
  let organizations: ReturnType<NonNullable<ReturnType<typeof capabilities>["organizations"]>> | undefined;
  setCapabilities({
    ...capabilities(),
    organizations: () => (organizations ??= import("../features/shell/organization-desktop").then((m) => m.desktopOrganizations())),
  });
  void askGuestChannels().then((channels) => setCapabilities({ ...capabilities(), wsl: channels.includes("wsl") }));
  // El Free router de plataforma con la sesión de Desk; fuera de la carga inicial.
  void import("../features/settings/free-router-desk").then((m) => m.installDeskFreeRouter());
}

/**
 * El arranque fija tema y lengua antes del primer pintado. Los efectos declaran
 * qué observan con `on(...)` y limpian, mediante `onCleanup`, junto a lo que
 * abren.
 */
seguirElTema();
// Rust crea la próxima ventana de este color (`appearance.rs`): sin él abre en blanco.
const reportarFondo = () =>
  void invoke("window_background", {
    color: getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
  }).catch(() => {});
reportarFondo();
new MutationObserver(reportarFondo).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme", "data-dark-style", "data-light-style"],
});
aplicarEscala();
aplicarVeloDePestanas();
window.addEventListener("keydown", atajoDeEscala);
trimNativeMenu(window, import.meta.env.DEV);
acotarSeleccionarTodo(window);
activarBarrasAlDesplazar();
// Igual que el tema, y por el mismo motivo: leída después de montar, la ventana
// abriría en español y cambiaría de lengua delante de quien mira.
aplicarLengua();

/**
 * Las lenguas instaladas en el app data no viajan en el binario, y leerlas es
 * un `invoke` asíncrono. **Se espera solo cuando hay algo que esperar**: si la
 * lengua que toca ya está registrada —`es`, `en`, o «sistema» resolviendo a una
 * de las dos— se monta sin pagar nada y los paquetes entran por detrás; si no,
 * se lee el disco antes del primer pintado — montar antes enseñaría la ventana
 * un instante en español antes de que cambiara sola.
 *
 * `refreshLanguage` después de cargar **vuelve a resolver**: la lengua se fijó al
 * evaluarse el motor, cuando el paquete todavía no estaba, y sin esto quedaría
 * en el respaldo aunque el catálogo ya esté dentro. Con la preferencia tal
 * cual, es idempotente.
 */
function laQueTocaYaEstaDentro(): boolean {
  const pref = semillaDelAlta();
  const pedido = pref === "sistema" ? navigator.language : pref;
  const registrada = (c: string) => lenguasDisponibles().some((m) => m.codigo === c);
  return registrada(pedido) || registrada(pedido.split("-")[0]);
}

let disposeApp: (() => void) | undefined;
let stopped = false;
export function disposeWindow() { stopped = true; disposeApp?.(); }

const montar = () => {
  if (stopped) return;
  const root = document.getElementById("root")!;
  // En la web el marco ya es hijo de `#root`. `render` de Solid, si hay un hijo,
  // inserta al final y lo deja: la ventana se vería dos veces.
  root.replaceChildren();
  disposeApp = render(
    () => (
      // El lanzador va antes que todo: sin motor conectado no hay a quién preguntar.
      // La preparación va por fuera de la app: si falta git no hay nada útil detrás.
      <Lanzador>
        <Setup>
          <App />
        </Setup>
      </Lanzador>
    ),
    root,
  );
};

const lenguasDeDisco = cargarPaquetes().then(refreshLanguage);
if (laQueTocaYaEstaDentro()) montar();
else void mountAfterLanguagePacks(lenguasDeDisco, montar);

// Las otras computadoras de la cuenta de Danil, en un trozo aparte: sin sesión no instala nada.
// La web trae su propio transporte (`web/main.tsx`).
if (capabilities().nativeWindow) void import("../features/machines/account").then((m) => m.startAccountMachines());
