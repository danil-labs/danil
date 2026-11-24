import CircleCheck from "lucide-solid/icons/circle-check";
import Circle from "lucide-solid/icons/circle";
import Sparkles from "lucide-solid/icons/sparkles";
import { For, Match, Show, Switch } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { cn } from "../../../../ui/src/lib/utils";
import { Spinner } from "../../../../ui/src/Spinner";
import { Consentir, DialogoDeConexion } from "../model/ports";
import { FilaDeIA } from "./ConnectAICards";
import { AL_FINAL, type Conexiones, type Fila, nombreDeFila } from "../queries/connect-store";

export { MapaDeConexiones } from "./ConnectAIMap";
export { ErrorDeTarjeta } from "./ConnectAICards";

/** Lo hecho y lo que falta del alta, debajo del mapa y en el resumen de «Personaliza». */
export function Comprobacion(props: { filas: { hecho: boolean; texto: string; enCurso?: boolean }[]; compacta?: boolean }) {
  return (
    <ul class={cn("m-0 grid list-none p-0", props.compacta ? "gap-2 text-ui" : "gap-2.5 text-sm")}>
      <For each={props.filas}>
        {(f) => (
          <li class={cn("flex items-center", props.compacta ? "gap-2" : "gap-2.5", f.hecho ? "text-success-strong" : "text-neutral-500")}>
            <Switch fallback={<Circle size={16} aria-hidden="true" />}>
              <Match when={f.hecho}>
                <CircleCheck size={16} aria-hidden="true" />
              </Match>
              <Match when={f.enCurso}>
                <Spinner class="text-primary" />
              </Match>
            </Switch>
            <span class="min-w-0 truncate">{f.texto}</span>
          </li>
        )}
      </For>
    </ul>
  );
}

/** El panel de la derecha: lo encontrado en esta computadora primero, luego los demás proveedores y ZCode al final. */
export function PanelDeIA(props: { c: Conexiones }) {
  const encontrada = (f: Fila) => f.detectada && f.agente !== AL_FINAL;
  const detectadas = () => props.c.filas().filter(encontrada);
  const otras = () => props.c.filas().filter((f) => !encontrada(f));
  return (
    <div class="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto rounded-lg border border-border bg-surface-raised p-5 [&>*]:shrink-0">
      <Show
        when={detectadas().length > 0}
        fallback={<h2 class="m-0 text-xs font-semibold text-neutral-500">{t("onboarding.ai.choose")}</h2>}
      >
        <h2 class="m-0 flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles size={13} aria-hidden="true" />
          {t("onboarding.ai.found")}
        </h2>
        <For each={detectadas()}>{(f) => <FilaDeIA c={props.c} f={f} />}</For>
        <h2 class="m-0 mt-1.5 text-xs font-semibold text-neutral-500">{t("onboarding.ai.others")}</h2>
      </Show>
      <For each={otras()}>{(f) => <FilaDeIA c={props.c} f={f} />}</For>
      <Show when={!props.c.cargada() && !props.c.falloDeCarga()}>
        <div class="grid h-[62px] place-items-center text-neutral-500">
          <Spinner />
        </div>
      </Show>
      <Show when={props.c.falloDeCarga()}>
        {(e) => <p class="m-0 text-xs text-error-strong">{e()}</p>}
      </Show>
      <Show when={props.c.filas().find((f) => props.c.pasos[f.id]?.k === "entrando")}>
        {(f) => {
          const p = () => props.c.pasos[f().id];
          const de = <K extends "url" | "codigo">(k: K) => {
            const x = p();
            return x?.k === "entrando" ? (x[k] ?? null) : null;
          };
          return (
            <DialogoDeConexion
              etiqueta={nombreDeFila(f())}
              url={de("url")}
              porConfirmar={de("codigo")}
              pideCodigo={p()?.k === "entrando" && Boolean((p() as { pideCodigo?: boolean }).pideCodigo)}
              salida={props.c.salidas[f().id] ?? []}
              onCancelar={() => void props.c.cancelar(f().id)}
              onCodigo={(codigo) => void props.c.enviarCodigo(f().id, codigo)}
            />
          );
        }}
      </Show>
      <Show when={props.c.pregunta()}>
        {(q) => (
          <Consentir
            texto={q().texto}
            error={props.c.errores[q().fila]}
            guardando={props.c.guardando()}
            onAceptar={() => void props.c.responder(true)}
            onCancelar={() => void props.c.responder(false)}
          />
        )}
      </Show>
    </div>
  );
}
