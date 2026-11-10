import { routerAvailable } from "@terminus/tasks";
import { createSignal, lazy, onCleanup, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { acceptedFreeModelPolicy, freeModelScope, sameFreeModelPolicy, type FreeModelConsent, type FreeModelPolicy, type FreeModelStartup } from "../../lib/free-model-policy.ts";
import { loadFreeModelPolicy } from "../../lib/free-model-policy-load.ts";
import type { Frase } from "../../lib/prose";
import { prosaDe } from "../../ui/Failure";

const cargarDialogo = () => import("./FreeRouterConsentDialog");
const DialogoDeConsentimiento = lazy(cargarDialogo);
const INTENTOS = 3;
const ESPERA_MS = 1000;

/** El motor con consentimiento central publica `acceptance_ref` tras un refresco en segundo plano. */
async function politicaConReintento(): Promise<FreeModelPolicy | null> {
  for (let intento = 1; ; intento++) {
    const policy = await loadFreeModelPolicy();
    if (policy || intento >= INTENTOS) return policy;
    await new Promise((resolve) => setTimeout(resolve, ESPERA_MS));
  }
}

/**
 * Lo que hay que aceptar antes de activar, y a qué versión de texto. Los dos
 * llegan juntos con la política del workspace: quien cambie la
 * frase tiene el número al lado, y un guarda en Rust falla si el texto se
 * mueve sin que la versión suba.
 */
export type Consentimiento = { lineas: Frase[]; version: number; policy: FreeModelPolicy };

/** El consentimiento de Router IA gratis: lo comparten Configuración y el selector de modelos. */
export function createFreeRouterConsent(opts: { agente: () => string; despues?: () => Promise<void> | void }) {
  let catalogGeneration = 0;
  onCleanup(() => { catalogGeneration++; });
  const [routeAvailable, setRouteAvailable] = createSignal<boolean | null>(null);
  const [aceptado, setAceptado] = createSignal(false);
  const [guardando, setGuardando] = createSignal(false);
  const [fallo, setFallo] = createSignal<string | null>(null);
  const [texto, setTexto] = createSignal<Consentimiento | null>(null);
  const [cargado, setCargado] = createSignal(false);
  const [preguntando, setPreguntando] = createSignal(false);
  const [leyendo, setLeyendo] = createSignal(false);

  async function refreshRoute(policy: FreeModelPolicy) {
    const generation = ++catalogGeneration;
    const catalog = await invoke<{ models: { id: string; gratis?: boolean }[] }>("list_models", { provider: opts.agente() }, freeModelScope(policy)).catch(() => null);
    if (generation === catalogGeneration) setRouteAvailable(catalog ? routerAvailable(catalog.models) : false);
  }

  async function cargar() {
    const generation = catalogGeneration;
    try {
      // El estado no necesita la referencia: el diálogo la espera al abrirse.
      const policy = await loadFreeModelPolicy(undefined, true);
      if (generation !== catalogGeneration) return;
      setTexto(policy ? { lineas: policy.lines, version: policy.version, policy } : null);
      setAceptado(!!policy?.accepted);
      setCargado(true);
      if (policy) void refreshRoute(policy);
    } catch {
      // Sin política legible se trata como motor sin Router.
      if (generation === catalogGeneration) setCargado(true);
    }
  }

  // El diálogo abre al instante y muestra dentro su carga y su error.
  async function preguntar() {
    setFallo(null);
    setLeyendo(true);
    setPreguntando(true);
    try {
      await cargarDialogo();
      const policy = await politicaConReintento();
      if (!policy?.enabled) throw new Error(t("settings.accounts.free.unavailable"));
      setTexto({ lineas: policy.lines, version: policy.version, policy });
    } catch (e) {
      // Sin texto vigente el diálogo no ofrece aceptar; el error queda dentro.
      setTexto(null);
      setFallo(prosaDe(e));
    } finally {
      setLeyendo(false);
    }
  }

  async function cambiar(valor: boolean) {
    catalogGeneration++;
    setGuardando(true);
    try {
      const policy = texto()?.policy;
      if (!policy) throw new Error(t("settings.accounts.free.unavailable"));
      const startup = await invoke<FreeModelStartup>("workspaces_startup");
      if (startup.active !== policy.workspace_id) throw new Error(t("settings.accounts.free.policy_changed"));
      // La referencia sale siempre de la relectura estricta, nunca de la política mostrada.
      const fresh = valor ? await loadFreeModelPolicy(policy) : null;
      if (valor && (!fresh?.acceptance_ref || !sameFreeModelPolicy(policy, fresh))) {
        throw new Error(t("settings.accounts.free.policy_changed"));
      }
      const w = await invoke<{ free_model_consent?: FreeModelConsent }>(
        "set_provider_consent",
        { provider: valor ? fresh!.acceptance_ref : opts.agente(), accepted: valor },
        freeModelScope(policy),
      );
      const accepted = acceptedFreeModelPolicy(policy, w.free_model_consent);
      setAceptado(accepted);
      if (valor && !accepted) throw new Error(t("settings.accounts.free.policy_changed"));
      await refreshRoute(policy);
      setPreguntando(false);
      setFallo(null);
      if (valor) await opts.despues?.();
      // La caja de chat no ofrece modelos de un agente sin autorizar: tiene que enterarse ahora.
      window.dispatchEvent(new CustomEvent("harness:consentimiento"));
    } catch (e) {
      setFallo(prosaDe(e));
      // Con la política cambiada se relee y se pide confirmar de nuevo sobre el texto vigente.
      if (valor && preguntando()) {
        const policy = await politicaConReintento().catch(() => null);
        if (policy?.enabled) setTexto({ lineas: policy.lines, version: policy.version, policy });
      }
    } finally {
      setGuardando(false);
    }
  }

  // Cancelar cierra y no activa nada, por las tres vías; el sí solo existe si se pulsa Activar.
  const dialogo = () => (
    <Show when={preguntando()}>
      <DialogoDeConsentimiento
        texto={leyendo() ? null : texto()}
        cargando={leyendo()}
        guardando={guardando()}
        error={fallo()}
        onAceptar={() => void cambiar(true)}
        onCancelar={() => setPreguntando(false)}
      />
    </Show>
  );

  return { routeAvailable, aceptado, guardando, fallo, texto, cargado, preguntando, cargar, preguntar, cambiar, dialogo };
}
