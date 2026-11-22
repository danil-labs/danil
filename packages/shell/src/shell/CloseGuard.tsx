import { invoke } from "@tauri-apps/api/core";
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { listen } from "../../../../apps/desktop/src/lib/serviceEvents";
import { capabilities } from "../../../host/src/platform";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../ui/src/Dialog";
import { FailureNote, asFailure, type Failure } from "../../../ui/src/Failure";
import { quietFinished } from "./TaskNotifier";
import { setTurnTitles, stopTurns, titled, type LiveTurn, type ShownTurn } from "./liveTurns";

/** Cerrar oculta; salir pide una decisión sobre los turnos del motor conectado a este cliente. */
export default function CloseGuard(props: { title: (session: string) => string | undefined }) {
  const [shown, setShown] = createSignal(false);
  const [rows, setRows] = createSignal<ShownTurn[]>([]);
  const [stopping, setStopping] = createSignal(false);
  const [failure, setFailure] = createSignal<Failure | null>(null);
  let acting = false;
  let exiting = false;
  let refreshing = false;
  let disposed = false;

  function payload(turns: ShownTurn[] | null) {
    const header = turns === null ? t("shell.tray.unknown")
      : turns.length ? t("shell.tray.header", { count: turns.length }) : t("shell.tray.idle");
    return {
      labels: {
        tooltip: header,
        header,
        open: t("shell.tray.open"),
        stop_all: t("shell.tray.stop_all"),
        quit: t("shell.tray.quit"),
      },
      items: (turns ?? []).map((row) => ({
        title: row.waiting ? `${row.title} · ${t("shell.close.waiting")}` : row.title,
      })),
    };
  }

  async function tick() {
    if (refreshing || disposed) return;
    refreshing = true;
    try {
      const turns = await titled(await invoke<LiveTurn[]>("list_live_turns"));
      if (!disposed) await invoke("tray_update", payload(turns));
    } catch {
      if (!disposed) await invoke("tray_update", payload(null)).catch(() => {});
    } finally {
      refreshing = false;
    }
  }

  function failed(error: unknown) {
    setFailure({ ...asFailure(error), what: t("shell.close.error") });
    setShown(true);
  }

  async function toBackground() {
    try {
      await invoke("window_to_background", payload(null));
      setShown(false);
      void tick();
    } catch (error) {
      failed(error);
    }
  }

  async function requestQuit() {
    if (exiting || acting || shown()) return;
    acting = true;
    setFailure(null);
    setRows([]);
    try {
      const turns = await invoke<LiveTurn[]>("list_live_turns");
      if (turns.length === 0) {
        await invoke("quit_completely");
        exiting = true;
      }
      else {
        setRows(await titled(turns));
        setShown(true);
      }
    } catch (error) {
      failed(error);
    } finally {
      acting = false;
    }
  }

  async function stopAndMaybeQuit(quit: boolean) {
    if (exiting || acting) return;
    acting = true;
    setStopping(true);
    setFailure(null);
    try {
      const turns = await invoke<LiveTurn[]>("list_live_turns");
      quietFinished();
      const results = await stopTurns(turns, invoke);
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
      if (quit) {
        await invoke("quit_completely");
        exiting = true;
      }
      else {
        setShown(false);
        void tick();
      }
    } catch (error) {
      failed(error);
    } finally {
      acting = false;
      setStopping(false);
    }
  }

  function quitWhenDone() {
    const shown = rows();
    setShown(false);
    void import("./restartWait").then((m) => m.waitThen("quit", shown));
  }

  onMount(() => {
    setTurnTitles(props.title);
    if (!capabilities().nativeWindow) return;
    const unlisten = [
      listen("close-requested", () => { if (!acting) void toBackground(); }),
      listen("tray-stop-all", () => void stopAndMaybeQuit(false)),
      listen("tray-quit", () => void requestQuit()),
    ];
    void tick();
    const refresh = setInterval(() => void tick(), 5000);
    onCleanup(() => {
      disposed = true;
      clearInterval(refresh);
      for (const u of unlisten) void u.then((off) => off());
    });
  });

  return (
    <Show when={shown()}>
      <Dialog open onOpenChange={(open) => { if (!open && !stopping()) setShown(false); }}>
        <DialogContent class="flex flex-col gap-3" data-close-guard>
          <DialogTitle class="text-sm font-semibold">{t("shell.close.title", { count: rows().length })}</DialogTitle>
          <p class="m-0 text-ui text-neutral-700">{t("shell.close.body")}</p>
          <Show when={failure()}>{(f) => <FailureNote f={f()} />}</Show>
          <Show when={rows().length > 0}>
            <ul class="m-0 grid list-none gap-0 rounded-md border border-neutral-200 p-0">
              <For each={rows()}>{(row) => (
                <li class="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 text-ui last:border-b-0">
                  <span class="min-w-0 flex-1 truncate">{row.title}</span>
                  <span class={row.waiting ? "shrink-0 font-semibold text-warning-strong" : "shrink-0 text-neutral-500"}>
                    {row.waiting ? t("shell.close.waiting") : t("shell.close.working")}
                  </span>
                </li>
              )}</For>
            </ul>
          </Show>
          <div class="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" disabled={stopping()} onClick={() => setShown(false)}>{t("shell.close.cancel")}</Button>
            <Button variant="secondary" size="sm" disabled={stopping()} onClick={() => void stopAndMaybeQuit(true)}>
              {stopping() ? t("shell.close.stopping") : t("shell.close.stop")}
            </Button>
            <Button variant="secondary" size="sm" disabled={stopping()} onClick={quitWhenDone}>{t("shell.close.when_done")}</Button>
            <Button size="sm" disabled={stopping()} onClick={() => void toBackground()}>{t("shell.close.background")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Show>
  );
}
