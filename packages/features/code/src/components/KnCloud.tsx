import { Match, Show, Switch, createEffect, createSignal, on, onCleanup } from "solid-js";
import { knCloudState, knCloudStart } from "../queries";
import { machineOf } from "../../../../host/src/machine";
import { listen } from "../../../../host/src/serviceEvents.ts";
import { Button } from "../../../../ui/src/Button";
import { FailureNote, asFailure, type Failure } from "../../../../ui/src/Failure";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { peso } from "../../../../../apps/desktop/src/lib/format";
import { avisarDeLosArboles } from "../queries/refresh";

/** `kn_cloud::Descarga`: lo que baja de la nube a la carpeta de un proyecto kn. */
export type Descarga = {
  workspace: string | null;
  project: string;
  state: "idle" | "confirm" | "running" | "done" | "error";
  fetched: number;
  failed: number;
  remaining: number;
  bytes_fetched: number;
  bytes_remaining: number;
  failure: Failure | null;
};

export default function KnCloud(props: { project: string; session: string }) {
  const [descarga, setDescarga] = createSignal<Descarga | null>(null);
  const [pidiendo, setPidiendo] = createSignal(false);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  let workspace: string | null = null;
  let recibidos = 0;

  const llega = (d: Descarga) => {
    const antes = descarga()?.state;
    recibidos++;
    setDescarga(d);
    if (antes !== undefined && antes !== d.state) avisarDeLosArboles(props.session);
  };

  createEffect(on(() => props.project, (project) => {
    setDescarga(null);
    workspace = null;
    const desde = recibidos;
    const oyente = listen<Descarga>("kn-cloud", (e) => {
      if (e.payload.project !== project) return;
      if (workspace && e.payload.workspace && e.payload.workspace !== workspace) return;
      llega(e.payload);
    });
    void knCloudState<Descarga>({ project }, machineOf(props.session))
      .then((d) => {
        if (!d || project !== props.project) return;
        workspace = d.workspace;
        if (recibidos === desde) setDescarga(d);
      })
      .catch(() => {});
    onCleanup(() => void oyente.then((dejar) => dejar()));
  }));

  async function empezar(retry: boolean) {
    if (pidiendo()) return;
    setPidiendo(true);
    setFallo(null);
    try {
      await knCloudStart({ project: props.project, retry }, machineOf(props.session));
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setPidiendo(false);
    }
  }

  const total = (d: Descarga) => d.fetched + d.failed + d.remaining;

  return (
    <>
      <Show when={descarga()}>
        {(d) => (
          <Switch>
            <Match when={d().state === "running"}>
              <p class="m-0 px-3 pt-2 text-caption text-neutral-500" role="status">
                {t("kn.cloud.progress", { done: d().fetched, total: total(d()) })}
              </p>
            </Match>
            <Match when={d().state === "confirm"}>
              <div class="flex items-center gap-2 px-3 pt-2">
                <p class="m-0 min-w-0 flex-1 text-caption text-neutral-500">
                  {t("kn.cloud.confirm", { count: d().remaining, size: peso(d().bytes_remaining) })}
                </p>
                <Button variant="secondary" size="compact" class="shrink-0" disabled={pidiendo()} onClick={() => void empezar(false)}>
                  {t("kn.cloud.start")}
                </Button>
              </div>
            </Match>
            <Match when={d().state === "done" && d().failed > 0}>
              <div class="flex items-center gap-2 px-3 pt-2">
                <p class="m-0 min-w-0 flex-1 text-caption text-neutral-500">
                  {t("kn.cloud.failed", { count: d().failed })}
                </p>
                <Button variant="ghost" size="compact" class="shrink-0" disabled={pidiendo()} onClick={() => void empezar(true)}>
                  {t("kn.cloud.retry")}
                </Button>
              </div>
            </Match>
            <Match when={d().state === "error" ? d().failure : null}>
              {(f) => <div class="px-3 pt-2"><FailureNote f={f()} /></div>}
            </Match>
          </Switch>
        )}
      </Show>
      <Show when={fallo()}>
        {(f) => <div class="px-3 pt-2"><FailureNote f={f()} /></div>}
      </Show>
    </>
  );
}
