import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { capabilities } from "../../lib/platform";
import { isWindows } from "../../lib/window";

/**
 * Los controles nativos que Windows pierde al quitar sus decoraciones.
 *
 * macOS conserva su semáforo: esta fila solo existe en Windows. Ahí
 * `decorations: false` deja a la app responsable de minimizar, maximizar y
 * cerrar; los dos primeros van al comando nativo de Tauri. Cerrar pasa por
 * Rust, que oculta la ventana y conserva los agentes trabajando.
 */
export default function ControlesDeVentana() {
  const [maximizada, setMaximizada] = createSignal(false);

  onMount(() => {
    if (!isWindows()) return;
    try {
      const ventana = getCurrentWindow();
      const leerMaximo = () =>
        void ventana.isMaximized().then(setMaximizada).catch(() => {});
      // El cambio solo llega al transicionar. Sembrar el estado evita que una
      // ventana que ya abre maximizada pinte el icono de maximizar al revés.
      leerMaximo();
      void ventana
        .onResized(leerMaximo)
        .then((desescuchar) => onCleanup(desescuchar))
        .catch(() => {});
    } catch {
      // El guarda `mount-frontend` no tiene ventana nativa; no hay control que sincronizar.
    }
  });

  const minimizar = () => {
    try {
      void getCurrentWindow().minimize().catch(() => {});
    } catch {}
  };
  const alternarMaximo = () => {
    try {
      void getCurrentWindow().toggleMaximize().catch(() => {});
    } catch {}
  };
  const pedirCierre = () => void invoke("request_close").catch(() => {});

  return (
    <Show when={isWindows() && capabilities().nativeWindow}>
      {/* **Sin `ml-auto` aquí, y no es un detalle.** Un margen automático se
          reparte el hueco libre con los demás márgenes automáticos de la misma
          fila: si quien pone estos controles ya tiene otro —el conmutador de la
          columna lo tenía—, el hueco se parte en dos y ese otro botón acaba
          flotando **en mitad de la barra de título**, lejos de los dos bordes.
          Pasó, se ve, y no hay nada en el código que lo señale.

          Así que alinear no es cosa de este componente: es de la fila que lo
          pone, que es la única que sabe qué más lleva. */}
      <div class="flex h-[30px] shrink-0 items-stretch">
        <button class="grid w-11 place-items-center text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary" type="button" aria-label={t("shell.window.minimize")} title={t("shell.window.minimize")} onClick={minimizar}>
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><path d="M1 5.5h8" fill="none" stroke="currentColor" /></svg>
        </button>
        <button class="grid w-11 place-items-center text-neutral-700 hover:bg-neutral-200 hover:text-neutral-950 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary" type="button" aria-label={maximizada() ? t("shell.window.restore") : t("shell.window.maximize")} title={maximizada() ? t("shell.window.restore") : t("shell.window.maximize")} onClick={alternarMaximo}>
          <Show when={maximizada()} fallback={<svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" /></svg>}>
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><path d="M3 3V1.5h5.5V7H7M1.5 3h5.5v5.5H1.5z" fill="none" stroke="currentColor" /></svg>
          </Show>
        </button>
        <button class="grid w-11 place-items-center text-neutral-700 hover:bg-error-strong hover:text-white focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary" type="button" aria-label={t("shell.window.close_app")} title={t("shell.window.close")} onClick={pedirCierre}>
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10"><path d="m1.5 1.5 7 7m0-7-7 7" fill="none" stroke="currentColor" /></svg>
        </button>
      </div>
    </Show>
  );
}
