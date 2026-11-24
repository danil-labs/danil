import { SCREEN_CONTROL_DESKTOP } from "../model/screen.ts";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { screenConnection, type Phase } from "../queries/connection";
import { screenInput } from "../model/input";

const MESSAGE: Record<Exclude<Phase, "connecting" | "live">, () => string> = {
  offline: () => t("screen.offline"),
  unavailable: () => t("screen.unavailable"),
  busy: () => t("screen.busy"),
  ended: () => t("screen.ended"),
  failed: () => t("screen.failed"),
};

/** VNC sobre el WebSocket autenticado que abre `open`. */
export default function Screen(props: { open: () => Promise<WebSocket> }) {
  const [phase, setPhase] = createSignal<Phase>("connecting");
  const [controllable, setControllable] = createSignal(false);
  let target!: HTMLDivElement;
  let connection: ReturnType<typeof screenConnection> | undefined;
  onMount(() => {
    connection = screenConnection({
      target, open: () => props.open(), load: () => import("@novnc/novnc"), phase: setPhase,
      configure(view) {
        const controls = screenInput(target);
        const named = (event: Event) => {
          // Los motores anteriores mantienen su visor de solo lectura.
          const supported = (event as CustomEvent<{ name: string }>).detail.name === SCREEN_CONTROL_DESKTOP;
          controls.release();
          view.viewOnly = !supported;
          setControllable(supported);
        };
        view.addEventListener("desktopname", named);
        return () => {
          view.removeEventListener("desktopname", named);
          controls.dispose();
          setControllable(false);
        };
      },
    });
    void connection.connect();
  });
  onCleanup(() => connection?.disconnect());

  const ended = () => {
    const p = phase();
    return p === "connecting" || p === "live" ? null : MESSAGE[p];
  };

  return (
    <main data-screen="" data-screen-phase={phase()} class="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface">
      <Show when={phase() === "live"}>
        <div class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-1.5">
          {/* La pantalla virtual no tiene escritorio: vacía se ve negra y parece rota. */}
          <span class="min-w-0 truncate text-xs text-neutral-500">{t("screen.empty_hint")}</span>
          {/* Con control, la pantalla se maneja directo: no hay modo que cambiar. */}
          <Show when={!controllable()}>
            <span class="shrink-0 text-xs text-neutral-500">{t("screen.control_unavailable")}</span>
          </Show>
        </div>
      </Show>
      <div ref={target} class="min-h-0 flex-1" classList={{ invisible: phase() !== "live" }} />
      <Show when={phase() !== "live"}>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <Show when={ended()} fallback={<p role="status" class="text-sm text-neutral-500">{t("screen.connecting")}</p>}>
            {(key) => (
              <>
                <p role="alert" class="max-w-sm text-sm text-neutral-700">{key()()}</p>
                <Button size="sm" variant="outline" onClick={() => void connection?.connect()}>{t("screen.retry")}</Button>
              </>
            )}
          </Show>
        </div>
      </Show>
    </main>
  );
}
