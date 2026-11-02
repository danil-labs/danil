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
import { capabilities } from "../lib/platform";
import { installDesktopDirectory } from "../features/shell/desktop-directory";
import "../styles/global.css";
import "../lib/sharedClock";
// Errores y avisos de encargado se leen al fallar algo, ya con la ventana montada: entran por detrás.
// Si el trozo no carga, caen a la prosa del motor; el panel de encargados lo vuelve a pedir.
void import("../locales/failurePhrases").catch((e) => console.warn("[lenguas] failurePhrases", e));

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

const montar = () =>
  render(
    () => (
      // El lanzador va antes que todo: sin motor conectado no hay a quién preguntar.
      // La preparación va por fuera de la app: si falta git no hay nada útil detrás.
      <Lanzador>
        <Setup>
          <App />
        </Setup>
      </Lanzador>
    ),
    document.getElementById("root")!,
  );

// El directorio de workspaces con la sesión de la ventana: el menú del perfil, como en la web.
if (capabilities().nativeWindow) installDesktopDirectory();

const lenguasDeDisco = cargarPaquetes().then(refreshLanguage);
// Las capacidades se leen al montar: Atención entra antes, en su trozo, solo con la bandera.
const atencion: Promise<void> =
  import.meta.env.DANIL_DESKTOP_ATTENTION && capabilities().nativeWindow
    ? Promise.race([
        import("../features/attention/desktop").then((m) => m.installDesktopAttention()),
        // Un trozo que no llega no deja la ventana sin montar.
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]).catch((e) => console.warn("[atencion]", e))
    : Promise.resolve();
// No un `await` de nivel superior: el objetivo del build es `es2020`, donde no
// existe, y subirlo por esta línea cambiaría el objetivo de la app entera.
void atencion.then(() => {
  if (laQueTocaYaEstaDentro()) montar();
  // Si la lectura falla o no acaba, se monta en el respaldo: el lanzador tiene que
  // poder conectar el motor que desbloquea las lecturas pendientes.
  else void mountAfterLanguagePacks(lenguasDeDisco, montar);
});

// Las otras computadoras de la cuenta de Danil, en un trozo aparte: sin sesión no instala nada.
// La web trae su propio transporte (`web/main.tsx`).
if (capabilities().nativeWindow) void import("../features/machines/account").then((m) => m.startAccountMachines());
