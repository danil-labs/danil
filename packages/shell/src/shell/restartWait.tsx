import { invokeNative as invoke } from "../../../host/src/native.ts";
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { Button } from "../../../ui/src/Button";
import { Toast } from "../../../ui/src/Toast";
import { t } from "../../../ui/src/lib/i18n";
import { invoke as routedInvoke } from "../../../engine-client/src/client.ts";
import { quietFinished } from "./TaskNotifier";
import {
  setWaitRows,
  setWaitingThen,
  stopTurns,
  titled,
  waitRows,
  waitingThen,
  type AfterWait,
  type LiveTurn,
  type ShownTurn,
} from "./liveTurns";

/** «A, B, C y 2 más»; la que espera una respuesta lo dice: no termina sola. */
function namesOf(rows: ShownTurn[], max = 3): string {
  const names = rows.map((row) => (row.waiting ? `${row.title} (${t("shell.close.waiting")})` : row.title));
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? t("shell.wait.more", { list: shown, count: names.length - max }) : shown;
}

/** Mientras se espera, mirar los turnos es local y barato. */
const WAIT_POLL = 2000;
let poll: ReturnType<typeof setInterval> | undefined;
let checking = false;

async function check() {
  if (checking || !waitingThen()) return;
  checking = true;
  try {
    const turns = await invoke<LiveTurn[]>("list_live_turns");
    const then = waitingThen();
    if (!then) return;
    if (turns.length === 0) {
      cancelWait();
      if (then === "restart") await invoke("restart_app");
      else await invoke("quit_completely");
      return;
    }
    setWaitRows(await titled(turns));
  } catch {
    // Sin respuesta del motor no se sabe si terminaron: se sigue esperando.
  } finally {
    checking = false;
  }
}

/** Reinicia o sale cuando ya no quede ningún turno vivo; la última elección manda. */
export function waitThen(then: AfterWait, rows: ShownTurn[] = []) {
  if (rows.length) setWaitRows(rows);
  setWaitingThen(then);
  if (poll === undefined) poll = setInterval(() => void check(), WAIT_POLL);
  void check();
}

function cancelWait() {
  if (poll !== undefined) clearInterval(poll);
  poll = undefined;
  setWaitingThen(null);
  setWaitRows([]);
}

/**
 * Reiniciar aplica la ventana nueva; el motor nuevo entra cuando el viejo queda
 * sin trabajo. Con tareas vivas no se ofrece reiniciar ya: se espera a que
 * terminen, o se detienen después de ver cuáles se cortan.
 */
export function Aplicar(props: { onLater: () => void }) {
  const [vivas, setVivas] = createSignal<LiveTurn[]>([]);
  const [confirmando, setConfirmando] = createSignal<ShownTurn[] | null>(null);
  const [deteniendo, setDeteniendo] = createSignal(false);
  const [fallo, setFallo] = createSignal(false);
  async function mirar() {
    const turnos = (await routedInvoke("list_live_turns").catch(() => [])) as LiveTurn[];
    setVivas(turnos);
    return turnos;
  }
  onMount(() => {
    void mirar();
    const reloj = setInterval(() => void mirar(), 10_000);
    onCleanup(() => clearInterval(reloj));
  });
  async function reiniciar() {
    // Una tarea pudo arrancar desde la última mirada: entonces se ofrece esperar.
    if ((await mirar()).length === 0) void routedInvoke("restart_app");
  }
  async function esperar() {
    waitThen("restart", await titled(vivas()));
  }
  async function confirmar() {
    setFallo(false);
    setConfirmando(await titled(await mirar()));
  }
  async function detenerYReiniciar() {
    setDeteniendo(true);
    setFallo(false);
    quietFinished();
    const resultados = await stopTurns(await mirar());
    setDeteniendo(false);
    if (resultados.some((r) => r.status === "rejected")) {
      setFallo(true);
      return;
    }
    void routedInvoke("restart_app");
  }
  return (
    <Show
      when={vivas().length > 0}
      fallback={
        <>
          <Button variant="secondary" size="compact" onClick={() => void reiniciar()}>
            {t("shell.update.restart")}
          </Button>
          <Button variant="ghost" size="compact" onClick={props.onLater}>
            {t("shell.update.later")}
          </Button>
        </>
      }
    >
      <Show
        when={confirmando()}
        fallback={
          <>
            <p class="m-0 basis-full text-xs text-neutral-500">
              {t("shell.update.waiting_tasks", { count: vivas().length })}
            </p>
            <Button variant="primary" size="compact" onClick={() => void esperar()}>
              {t("shell.update.restart_when_done")}
            </Button>
            <Button variant="secondary" size="compact" onClick={() => void confirmar()}>
              {t("shell.update.stop_and_restart")}
            </Button>
            <Button variant="ghost" size="compact" onClick={props.onLater}>
              {t("shell.update.later")}
            </Button>
          </>
        }
      >
        {(filas) => (
          <>
            <p class="m-0 basis-full text-xs text-neutral-700" data-stop-confirm>
              {t("shell.update.stop_confirm", { count: filas().length, titles: namesOf(filas(), 5) })}
            </p>
            <Show when={fallo()}>
              <p class="m-0 basis-full text-xs text-warning-strong">{t("shell.update.stop_failed")}</p>
            </Show>
            <Button variant="danger" size="compact" disabled={deteniendo()} onClick={() => void detenerYReiniciar()}>
              {deteniendo() ? t("shell.close.stopping") : t("shell.update.stop_confirm_yes")}
            </Button>
            <Button variant="ghost" size="compact" disabled={deteniendo()} onClick={() => setConfirmando(null)}>
              {t("shell.update.stop_confirm_back")}
            </Button>
          </>
        )}
      </Show>
    </Show>
  );
}

/** Lo que se espera para reiniciar o salir: queda a la vista hasta que termina o se cancela. */
export function EsperaDeTareas() {
  return (
    <Show when={waitingThen()}>
      {(then) => (
        <Toast data-wait-notice="">
          <p class="m-0 text-ui font-semibold">
            {then() === "restart" ? t("shell.wait.restart_title") : t("shell.wait.quit_title")}
          </p>
          <Show when={waitRows().length > 0}>
            <p class="m-0 text-xs text-neutral-500">
              {waitRows().some((row) => row.named)
                ? t("shell.wait.for", { titles: namesOf(waitRows()) })
                : t("shell.wait.for_count", { count: waitRows().length })}
            </p>
          </Show>
          <div class="flex gap-1.5">
            <Button variant="ghost" size="compact" onClick={cancelWait}>
              {t("shell.wait.cancel")}
            </Button>
          </div>
        </Toast>
      )}
    </Show>
  );
}
