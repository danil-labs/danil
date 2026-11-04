import { For, Show, createSignal } from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { machineOf } from "../machines/store";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import { t } from "../../lib/i18n";
import { df } from "../../lib/format";
import { avisarDeLosArboles } from "./refresh";
import { EmptyState } from "../../ui/EmptyState";

type Pendiente = {
  path: string;
  kind: "added" | "modified" | "deleted" | string;
  session_at: number | null;
  principal_at: number | null;
};

type Resumen = { files: Pendiente[]; folder_updated: boolean };

function fecha(ms: number | null) {
  if (ms == null) return t("kn.pending.absent");
  return df({ dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

function clase(kind: string) {
  if (kind === "added") return t("kn.pending.added");
  if (kind === "deleted") return t("kn.pending.deleted");
  return t("kn.pending.modified");
}

export default function KnIntegrate(props: {
  project: string;
  session: string;
  changed?: number | null;
  /** En la fila de búsqueda cabe poco: el número solo, y la cuenta completa en el título. */
  corto?: boolean;
}) {
  const [abierto, setAbierto] = createSignal(false);
  const [ocupado, setOcupado] = createSignal<"finish" | "update" | null>(null);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [pendientes, setPendientes] = createSignal<Resumen | null>(null);

  async function abrir() {
    setFallo(null);
    setPendientes(null);
    setAbierto(true);
    try {
      setPendientes(await invoke<Resumen>("kn_pending", {
        project: props.project,
        session: props.session,
      }, machineOf(props.session)));
    } catch (e) {
      setFallo(asFailure(e));
    }
  }

  async function integrar() {
    if (ocupado()) return;
    setOcupado("finish");
    setFallo(null);
    try {
      await invoke("kn_finish", { project: props.project, session: props.session }, machineOf(props.session));
      setAbierto(false);
      avisarDeLosArboles(props.session);
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setOcupado(null);
    }
  }

  async function actualizar() {
    if (ocupado()) return;
    setOcupado("update");
    setFallo(null);
    try {
      await invoke("kn_update", { project: props.project, session: props.session }, machineOf(props.session));
      setPendientes(await invoke<Resumen>("kn_pending", {
        project: props.project,
        session: props.session,
      }, machineOf(props.session)));
    } catch (e) {
      setFallo(asFailure(e));
    } finally {
      setOcupado(null);
    }
  }

  const conflicto = () => {
    const w = fallo()?.what;
    return typeof w === "object" && w && "clave" in w && w.clave === "kn.error.conflict";
  };

  const cuantos = () => pendientes()?.files.length ?? props.changed ?? 0;
  const carpetaActualizada = () => pendientes()?.folder_updated === true;

  return (
    <>
      <Button variant="secondary" size="compact" class="shrink-0" onClick={() => void abrir()}
        title={props.corto && cuantos() ? t("kn.pending.count", { count: cuantos() }) : undefined}>
        {t("kn.integrate")}
        <Show when={cuantos()}>
          {(n) => <span class="font-normal text-neutral-500">· {props.corto ? n() : t("kn.pending.count", { count: n() })}</span>}
        </Show>
      </Button>
      <Dialog open={abierto()} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogTitle class="m-0 text-lead font-semibold">
            {t("kn.integrate.title")}
          </DialogTitle>
          <p class="m-0 mt-3 text-sm leading-6 text-neutral-500">
            {t("kn.integrate.body")}
          </p>
          <Show when={pendientes()} fallback={null}>
            {(lista) => (
              <Show
                when={lista().files.length > 0}
                fallback={<EmptyState class="mt-3" title={t("kn.integrate.empty")} />}
              >
                <ul class="m-0 mt-3 max-h-56 list-none overflow-auto p-0">
                  <For each={lista().files}>
                    {(p) => (
                      <li class="border-t border-border py-2 first:border-t-0">
                        <div class="font-mono text-label text-neutral-950">{p.path}</div>
                        <div class="text-xs text-neutral-500">{clase(p.kind)}</div>
                        <div class="text-xs text-neutral-500">
                          {t("kn.pending.task")}: {fecha(p.session_at)}
                        </div>
                        <div class="text-xs text-neutral-500">
                          {t("kn.pending.folder")}: {fecha(p.principal_at)}
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            )}
          </Show>
          <Show when={fallo()}>{(f) => <div class="mt-3"><FailureNote f={f()} /></div>}</Show>
          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAbierto(false)}>
              {t("kn.integrate.cancel")}
            </Button>
            <Show when={conflicto() || carpetaActualizada()}>
              <Button
                variant="secondary"
                size="sm"
                disabled={ocupado() !== null}
                onClick={() => void actualizar()}
              >
                {ocupado() === "update" ? t("kn.update.busy") : t("kn.update")}
              </Button>
            </Show>
            <Button
              size="sm"
              disabled={ocupado() !== null || pendientes() === null || carpetaActualizada() || pendientes()?.files.length === 0}
              onClick={() => void integrar()}
            >
              {ocupado() === "finish" ? t("kn.integrate.busy") : t("kn.integrate.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
