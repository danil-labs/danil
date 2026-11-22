/**
 * Las cuentas de agente y la política de cuándo preguntarle a su plan. Lo
 * consumen la pantalla de Configuración y el popover de la franja de consumo.
 *
 * **Las cuentas son del workspace, no de la máquina**: con qué suscripción se
 * trabaja es parte de con quién trabajas (`src-tauri/src/secrets/accounts.rs`).
 */
import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import { legible, type Query, type Read } from "../../../../../apps/desktop/src/lib/limits";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { detalleDe } from "../../../../ui/src/Failure";
import type { MaquinasDeAjustes } from "../model/machines-port";

export { type Account, type AccountList, type AccountStatus, type AgentOpt, type EnEspera, type LoginEvent } from "../../../../ui/src/lib/accounts.ts";

/**
 * La lectura de límites de una cuenta en Configuración.
 *
 * La representación vive en `AccountCard`: aquí solo queda cuándo preguntar y
 * cómo conservar la última lectura buena si la siguiente falla. Separarlo así
 * deja a Configuración y al popover pintar exactamente la misma tarjeta sin
 * obligarlos a compartir su política de consultas.
 */
export function createAccountLimit(props: {
  agent: string;
  id: string;
  agentLabel: string;
  active: boolean;
  orden: number;
  tras: number;
  enabled: boolean;
  machineOf: MaquinasDeAjustes["machineOf"];
}) {
  const [estado, setEstado] = createSignal<Query | undefined>();
  const [preguntando, setPreguntando] = createSignal(false);
  const [ultimo, setUltimo] = createSignal<Read | undefined>();

  async function preguntar(force: boolean) {
    if (!props.enabled || preguntando()) return;
    setPreguntando(true);
    try {
      const r = await invoke<Query>("account_limits", {
        provider: props.agent,
        id: props.id,
        force,
      }, props.machineOf(props.id));
      setEstado(r);
      const buena = legible(r);
      if (buena) setUltimo(buena);
    } catch (error) {
      setEstado({
        mode: "failed",
        what: t("settings.limits.error", { agent: props.agentLabel }),
        detail: detalleDe(error),
      });
    } finally {
      setPreguntando(false);
    }
  }

  /**
   * **Va con `on(...)` y la lista escrita, no rastreando solo.**
   *
   * El cuerpo lee `props.agent`, `props.id` y `props.agentLabel` a través de
   * `preguntar`. Sin `on(...)`, `createEffect` los rastrearía todos y una cuenta
   * que solo cambia de etiqueta —porque el CLI publicó su correo— relanzaría la
   * consulta al proveedor. Cuáles disparan es una decisión, así que se escribe.
   */
  createEffect(
    on(
      () => [props.active, props.enabled, props.orden, props.tras] as const,
      ([active, enabled, orden, tras]) => {
        setEstado(undefined);
        setUltimo(undefined);
        if (!enabled) return;
        // Las inactivas se escalonan: disparar cinco consultas a la vez hace
        // que el proveedor conteste 429 justo cuando se intenta comparar las
        // cuentas.
        const t = window.setTimeout(
          () => void preguntar(tras > 0),
          active ? 0 : 200 * (orden + 1),
        );
        onCleanup(() => clearTimeout(t));
      },
    ),
  );

  return {
    get limits() {
      return estado();
    },
    get lastGood() {
      return ultimo();
    },
    get loading() {
      return props.enabled && preguntando() && !estado();
    },
    get refreshing() {
      return preguntando();
    },
    refresh: () => preguntar(true),
  };
}
