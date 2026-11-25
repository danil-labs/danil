import { callEngine } from "../../../../engine-client/src/client.ts";
import { t } from "../../../../ui/src/lib/i18n";
import { acceptedFreeModelPolicy, freeModelScope, sameFreeModelPolicy, type FreeModelConsent, type FreeModelStartup } from "../../../../session/src/free-model-policy.ts";
import { loadFreeModelPolicy } from "../../../../session/src/free-model-policy-load.ts";
import { prosaDe } from "../../../../ui/src/Failure";
import type { CargaDeConexiones } from "./connect-load";
import type { EstadoDeConexiones } from "./connect-state";

/** El aviso del Free Router: se pregunta, se guarda la respuesta en el workspace y se baja si falta. */
export function crearConsentimiento(estado: EstadoDeConexiones, carga: CargaDeConexiones) {
  const { setErrores, pregunta, setPregunta, setGuardando } = estado;
  const { agente, fila, poner, descargar } = carga;
  async function preguntar(id: string) {
    try {
      const policy = await loadFreeModelPolicy();
      if (!policy?.enabled) throw new Error(t("settings.accounts.free.unavailable"));
      setErrores(id, null);
      setPregunta({ fila: id, texto: { lineas: policy.lines, version: policy.version, policy } });
    } catch (e) {
      setErrores(id, prosaDe(e));
    }
  }

  async function responder(acepta: boolean) {
    const q = pregunta();
    const f = q && fila(q.fila);
    if (!q || !f) return;
    if (!acepta) return void setPregunta(null);
    setGuardando(true);
    try {
      const policy = q.texto.policy;
      const startup = await callEngine<FreeModelStartup>("workspaces_startup");
      if (startup.active !== policy.workspace_id || !sameFreeModelPolicy(policy, await loadFreeModelPolicy(policy))) throw new Error(t("settings.accounts.free.policy_changed"));
      const workspace = await callEngine<{ free_model_consent?: FreeModelConsent }>("set_provider_consent", {
        provider: policy.acceptance_ref, accepted: true,
      }, freeModelScope(policy));
      if (!acceptedFreeModelPolicy(policy, workspace.free_model_consent)) throw new Error(t("settings.accounts.free.policy_changed"));
      setPregunta(null);
      if (!agente(f.agente)?.available && !(await descargar(f))) return;
      window.dispatchEvent(new CustomEvent("harness:consentimiento"));
      poner(f.id, { k: "conectada", cuenta: t("settings.accounts.free.warning_short"), id: null });
    } catch (e) {
      setErrores(f.id, prosaDe(e));
    } finally {
      setGuardando(false);
    }
  }

  return { preguntar, responder };
}
