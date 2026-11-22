import { type JSX, onMount, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { FailureNote } from "../../../../ui/src/Failure";
import { createFreeRouterConsent } from "./free-router-consent";
import { SettingsRow } from "../../../../ui/src/SettingsLayout";

/** El aviso de uso acompaña la política versionada del motor. */
const AVISO_DE_USO = () => t("settings.accounts.free.warning");

/**
 * Cuál es ese agente no se escribe aquí: llega por `props.agente`, y quién lo
 * monta lo decide la tabla (`inferencia === "sin_pedir_nada"`, la misma
 * columna que dice por qué hace falta consentimiento). Con el id escrito
 * dentro, este bloque solo serviría a una fila.
 */
export function ModelosGratuitos(props: {
  nombre: string;
  marca?: JSX.Element;
  agente: string;
  proveedor: string;
  /**
   * Trae el CLI que sirve estos modelos, o `undefined` si ya está.
   *
   * Corre después de guardar el sí, no antes: se decide aquí que el material
   * salga de esta computadora, y bajar cien megas antes de aceptar gastaría
   * el disco por una pregunta que puede contestarse que no.
   *
   * Que esté definido es también cómo esta pantalla sabe que falta el
   * binario, y de eso depende que no diga «activados» sobre algo que no
   * puede correr.
   */
  preparar?: () => Promise<void>;
  preparando?: boolean;
  /**
   * Si el binario no está en la máquina. Es un dato, no se deduce de que
   * `preparar` esté definido: traerlo es del panel de arriba, que monta el
   * botón junto al de las otras dos superficies; aquí solo decide qué
   * afirma la etiqueta.
   */
  falta: boolean;
}) {
  const consent = createFreeRouterConsent({
    agente: () => props.agente,
    despues: () => props.preparar?.(),
  });
  const { routeAvailable, aceptado, guardando, fallo, texto, preguntando, preguntar, cambiar } = consent;
  onMount(() => void consent.cargar());

  return (
    <>
    {/* Cancelar cierra y no activa nada, por las tres vías. No deja el
        interruptor a medias ni escribe un estado intermedio: el sí solo
        existe si se pulsa Activar. */}
    {consent.dialogo()}
    <SettingsRow
      label={
        props.nombre || props.marca ? (
          <span class="flex flex-wrap items-center gap-2">
            {props.nombre}
            {props.marca}
          </span>
        ) : ""
      }
      description={
      <>
      {/* Omitir el proveedor o alejar el aviso oculta el destino de los datos al activar. */}
      <Show
        when={!aceptado() || props.falta || !texto()?.policy.enabled}
        fallback={<p class="m-0">{t("settings.accounts.free.warning_short")}</p>}
      >
        <p class="m-0">
          {t("settings.accounts.free.provider", { provider: t("settings.ai_providers.free_detail") })}
        </p>
        <p class="m-0">
          <strong>{AVISO_DE_USO()}</strong>
        </p>
      </Show>
      <Show when={aceptado() && routeAvailable() === false}><p class="m-0">{t("chat.model.router_route_unavailable")}</p></Show>
      <Show when={!texto()}><p class="m-0">{t("settings.accounts.free.unavailable")}</p></Show>
      <Show when={!preguntando() && fallo()}>
        {(f) => (
          <div class="mt-2">
            <FailureNote f={{ what: t("settings.accounts.free.error_save"), detail: f() }} />
          </div>
        )}
      </Show>
      </>
      }
    >
      <Show
        when={aceptado()}
        fallback={
          <Button
            size="sm"
            // Sin el texto no se puede pedir el sí, y tampoco se ofrece
            // activar: aceptar sin ver qué se acepta no es un consentimiento.
            disabled={guardando() || props.preparando || !texto()?.policy.enabled}
            onClick={() => void preguntar()}
          >
            {props.preparando
              ? t("settings.accounts.preparing")
              : t("settings.accounts.free.activate")}
          </Button>
        }
      >
        <div class="flex items-center gap-2">
          {/* «Activados» solo cuando de verdad se pueden usar. Con el sí
              guardado y sin binario, esta etiqueta afirmaría algo que el
              chat contradice tres clics más allá, donde la superficie sale
              «no instalado» y no deja empezar una tarea. Consentimiento y
              binario son dos cosas distintas —no se mezclan al guardarlas,
              retiraría un sí ya dado— pero lo que la pantalla afirma tiene
              que ser las dos.

              Lo que falta se nombra y se ofrece: regla de `AGENTS.md` para
              cuando algo desaparece de la máquina. Nombrarlo se quedó aquí;
              ofrecerlo está en el bloque de arriba, donde las otras dos
              superficies lo tienen. */}
          <Show
            when={props.falta}
            fallback={<Badge tone={texto()?.policy.enabled && routeAvailable() ? "success" : "neutral"}>{texto()?.policy.enabled && routeAvailable() ? t("settings.accounts.free.active") : t("settings.accounts.free.consented")}</Badge>}
          >
            <Badge tone="danger">{t("settings.accounts.free.missing")}</Badge>
          </Show>
          <Button
            variant="outline"
            size="compact"
            disabled={guardando() || props.preparando}
            onClick={() => cambiar(false)}
            title={t("settings.accounts.free.deactivate_title")}
          >
            {t("settings.accounts.free.deactivate")}
          </Button>
        </div>
      </Show>
    </SettingsRow>
    </>
  );
}
