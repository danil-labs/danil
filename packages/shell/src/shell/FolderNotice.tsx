import { Show, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { invoke } from "../../../engine-client/src/client.ts";
import { machineOf } from "../../../features/machines/src/queries/store";
import { Button } from "../../../ui/src/Button";
import { Toast } from "../../../ui/src/Toast";
import { t } from "../../../ui/src/lib/i18n";

type Resumen = { files: unknown[]; folder_updated: boolean };

/**
 * Aviso de que la carpeta origen de una sesión kn abierta se movió.
 *
 * Es el mismo sitio y la misma forma que el aviso de fuentes atrasadas:
 * una tarjeta que no interrumpe. No va al riel: una sesión nueva ya copia
 * la carpeta, y solo importa la que está abierta y se quedó atrás.
 */
export default function AvisoDeCarpeta(props: {
  project: string;
  session: string | null;
}) {
  const [atrasada, setAtrasada] = createSignal(false);
  const [actualizando, setActualizando] = createSignal(false);
  const [descartada, setDescartada] = createSignal<string | null>(null);

  const clave = () => (props.session ? `${props.project}:${props.session}` : "");

  async function mirar() {
    if (document.visibilityState !== "visible") return;
    const id = props.session;
    if (!id || !props.project) {
      setAtrasada(false);
      return;
    }
    try {
      const r = await invoke<Resumen>("kn_pending", {
        project: props.project,
        session: id,
      }, machineOf(id));
      setAtrasada(r.folder_updated);
    } catch {
      setAtrasada(false);
    }
  }

  createEffect(on(() => [props.project, props.session] as const, () => void mirar()));

  onMount(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") void mirar();
    };
    document.addEventListener("visibilitychange", alVolver);
    const alCerrar = () => void mirar();
    window.addEventListener("harness:turno-cerrado", alCerrar);
    onCleanup(() => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("harness:turno-cerrado", alCerrar);
    });
  });

  async function actualizar() {
    const id = props.session;
    if (!id || actualizando()) return;
    setActualizando(true);
    try {
      await invoke("kn_update", { project: props.project, session: id }, machineOf(id));
      setAtrasada(false);
    } catch {
      await mirar();
    } finally {
      setActualizando(false);
    }
  }

  return (
    <Show when={atrasada() && descartada() !== clave()}>
      <Toast onDismiss={() => setDescartada(clave())}>
        <p class="m-0 text-ui font-semibold">{t("kn.stale.title")}</p>
        <p class="m-0 text-xs text-neutral-500">{t("kn.stale.body")}</p>
        <div class="flex gap-1.5">
          <Button size="sm" disabled={actualizando()} onClick={() => void actualizar()}>
            {actualizando() ? t("kn.stale.updating") : t("kn.stale.update")}
          </Button>
        </div>
      </Toast>
    </Show>
  );
}
