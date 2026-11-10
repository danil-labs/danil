import { For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { prosa } from "../../lib/prose";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent } from "../../ui/Dialog";
import { Spinner } from "../../ui/Spinner";
import type { Consentimiento } from "./free-router-consent";
import "../../locales/settingsPhrases";

/**
 * El sí explícito, antes de activar.
 *
 * No choca con «una interfaz que necesita explicarse está mal diseñada»
 * (AGENTS.md): la regla prohíbe la glosa, el párrafo que describe lo que la
 * sección es; un consentimiento es retroalimentación sobre lo que el sistema
 * va a hacer, que la misma regla permite.
 *
 * Cancelar es una salida de verdad, no un paso más: si la única forma de
 * cerrar fuera aceptar, la decisión ya estaría tomada. Se sale por tres
 * vías —el botón, Escape y pulsar fuera— y las tres dejan el mismo estado:
 * no se activa nada.
 *
 * Cancelar no es un fallo: ni mensaje de error ni nota roja. Es una
 * respuesta legítima a una pregunta legítima; tratarla como error empujaría
 * a aceptar, lo que un consentimiento no puede hacer.
 */
export function Consentir(props: {
  texto: Consentimiento;
  guardando: boolean;
  error?: string | null;
  onAceptar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && props.onCancelar()}>
        <DialogContent
          class="w-[min(520px,100%)] max-w-[520px] p-0"
          aria-label={t("settings.accounts.consent.title")}
        >
          <div class="flex flex-col gap-3 p-5">
            <For each={props.texto.lineas}>
              {(linea, i) => (
                <p class={cn("m-0 text-xs leading-6 text-neutral-500", i() === 0 && "font-medium text-neutral-950")}>{prosa(linea)}</p>
              )}
            </For>
            <div class="flex flex-wrap gap-x-3 gap-y-1">
              <For each={props.texto.policy.terms}>{(term) => (
                <Button variant="ghost" size="sm" onClick={() => void invoke("open_external", { target: term.url })}>{term.url.includes("privacy") ? t("settings.accounts.free.privacy", { provider: term.label }) : t("settings.accounts.free.terms", { provider: term.label })}</Button>
              )}</For>
            </div>
            <Show when={props.error}>{(error) => <p role="alert" class="m-0 text-xs text-error-strong">{error()}</p>}</Show>
            <div class="mt-2 flex justify-end gap-2">
              {/* Cancelar primero en el orden de lectura y sin peso visual: la
                  acción que gasta algo es la otra, y esta tiene que poder
                  pulsarse sin buscarla. */}
              <Button
                variant="outline"
                size="sm"
                onClick={props.onCancelar}
                disabled={props.guardando}
              >
                {t("settings.accounts.consent.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={props.onAceptar}
                disabled={props.guardando}
              >
                {t("settings.accounts.consent.accept")}
              </Button>
            </div>
          </div>
        </DialogContent>
    </Dialog>
  );
}

/** El diálogo del sí con su propia carga y su propio error, antes de tener el texto. */
export default function DialogoDeConsentimiento(props: {
  texto: Consentimiento | null;
  cargando: boolean;
  guardando: boolean;
  error?: string | null;
  onAceptar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Show
      when={props.texto}
      fallback={
        <Dialog open onOpenChange={(abierto) => !abierto && props.onCancelar()}>
          <DialogContent class="w-[min(520px,100%)] max-w-[520px] p-0" aria-label={t("settings.accounts.consent.title")}>
            <div class="flex flex-col gap-3 p-5" aria-busy={props.cargando}>
              <Show when={props.cargando}>
                <p class="m-0 flex items-center gap-2 text-xs text-neutral-500"><Spinner />{t("settings.accounts.free.loading")}</p>
              </Show>
              <Show when={!props.cargando && props.error}>{(error) => <p role="alert" class="m-0 text-xs text-error-strong">{error()}</p>}</Show>
              <div class="mt-2 flex justify-end">
                <Button variant="outline" size="sm" onClick={props.onCancelar}>{t("settings.accounts.consent.cancel")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      {(texto) => <Consentir texto={texto()} guardando={props.guardando} error={props.error} onAceptar={props.onAceptar} onCancelar={props.onCancelar} />}
    </Show>
  );
}
