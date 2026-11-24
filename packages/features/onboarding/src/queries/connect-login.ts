import { onCleanup } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { cancelLoopbackForAccount } from "../../../../engine-client/src/loopbackLogin.ts";
import { freeModelScope } from "../../../../session/src/free-model-policy.ts";
import { loadFreeModelPolicy } from "../../../../session/src/free-model-policy-load.ts";
import { listen } from "../../../../host/src/serviceEvents.ts";
import { accountPresentation } from "../../../../ui/src/lib/accounts.ts";
import type { AccountList, AccountStatus, AgentOpt, LoginEvent } from "../../../../ui/src/lib/accounts.ts";
import { explicar } from "./connect-rows";
import type { CargaDeConexiones } from "./connect-load";
import type { EstadoDeConexiones } from "./connect-state";

export type Agente = AgentOpt & { source: string | null; system_broken: boolean };
type Avance = { id: string; done: number; bytes: number };
type AvanceDeInstalacion = { operation: string; kind: string; done: number; bytes: number };

export async function cuentaConectada(agent: string): Promise<{ cuenta: string; id: string } | null> {
  const lista = await callEngine<AccountList>("list_accounts", { provider: agent });
  const vivas = lista.accounts.filter((a) => a.authenticated_at !== null);
  const activa = vivas.find((a) => a.id === lista.active) ?? vivas[0];
  if (!activa) return null;
  const { name, plan } = accountPresentation(activa);
  return { cuenta: plan ? `${name} · ${plan}` : name, id: activa.id };
}

/** Cada conexión de una cuenta: entrar, la clave, el alta, cancelar y desconectar, y lo que avisa el motor. */
export function crearEntradaDeConexiones(estado: EstadoDeConexiones, carga: CargaDeConexiones, preguntar: (id: string) => Promise<void>) {
  const { filas, pasos, setErrores, setSalidas } = estado;
  const { agente, fila, enCurso, poner, cargar, descargar, sesionesDelSistema, cerrar } = carga;
  let entrada: { fila: string; agente: string; cuenta: string } | null = null;
  // Cerrar el navegador no avisa a nadie: sin respuesta en este plazo, el login se da por fallido.
  const PLAZO_DE_ENTRADA_MS = 3 * 60_000;
  let plazo: ReturnType<typeof setTimeout> | undefined;
  function vigilarEntrada(id: string, cuenta: string) {
    clearTimeout(plazo);
    plazo = setTimeout(() => {
      const e = entrada;
      if (!e || e.cuenta !== cuenta || pasos[id]?.k !== "entrando") return;
      entrada = null;
      cancelLoopbackForAccount(cuenta);
      void callEngine("cancel_login", { id: cuenta }).catch(() => {});
      void callEngine("discard_account", { provider: e.agente, id: cuenta }).catch(() => {});
      setErrores(id, t("onboarding.ai.login_timeout"));
      poner(id, { k: "instalada" });
    }, PLAZO_DE_ENTRADA_MS);
  }

  async function conectar(id: string) {
    const f = fila(id);
    const a = f && agente(f.agente);
    if (!f || !a || enCurso(id)) return;
    setErrores(id, null);
    if (f.modo === "consentimiento") return void preguntar(id);
    if (!a.available) {
      if (a.external_install_url) {
        poner(id, { k: "externa" });
        callEngine("open_external", { target: a.external_install_url }).catch(() => {});
        return;
      }
      if (!(await descargar(f))) return;
    }
    if (f.modo === "clave") return poner(id, { k: "clave" });
    await entrar(id);
  }

  /** «Usar esta»: la sesión que ya hay en la computadora pasa a ser una cuenta del workspace, sin volver a entrar. */
  async function usarSesion(id: string) {
    const f = fila(id);
    const p = pasos[id];
    if (!f || p?.k !== "sesion") return;
    setErrores(id, null);
    poner(id, { k: "comprobando" });
    try {
      const cuenta = await callEngine<{ id: string }>("adopt_system_session", { provider: f.agente });
      const conectada = await cuentaConectada(f.agente);
      poner(id, { k: "conectada", cuenta: conectada?.cuenta ?? p.identidad, id: cuenta.id });
    } catch (e) {
      setErrores(id, explicar(e));
      poner(id, p);
    }
  }

  async function entrar(id: string) {
    const f = fila(id);
    if (!f) return;
    let cuenta: string | null = null;
    try {
      cuenta = (await callEngine<{ id: string }>("add_account", { provider: f.agente, label: "" })).id;
      entrada = { fila: id, agente: f.agente, cuenta };
      setSalidas(id, []);
      poner(id, { k: "entrando", cuenta });
      await callEngine("login_account", { provider: f.agente, id: cuenta, mode: "tuberia" });
    } catch (e) {
      entrada = null;
      if (cuenta) await callEngine("discard_account", { provider: f.agente, id: cuenta }).catch(() => {});
      setErrores(id, explicar(e));
      poner(id, { k: "instalada" });
    }
  }

  // Un login que el CLI terminó deja la cuenta marcada como autenticada y `discard_account` ya no la tira:
  // la que este intento creó y no quedó conectada se quita entera.
  async function terminarEntrada(motivo: string) {
    const e = entrada;
    if (!e) return;
    clearTimeout(plazo);
    entrada = null;
    try {
      const estado = await callEngine<AccountStatus>("account_status", { provider: e.agente, id: e.cuenta });
      if (!motivo && estado.authenticated) return void (await quedoConectada(e.fila, e.agente, e.cuenta));
      // La cuenta se queda: ya tiene la sesión, y en cuanto el alta exista se conecta sin volver a entrar.
      if (!motivo && estado.signup) {
        const url = estado.signup.url;
        poner(e.fila, { k: "alta", cuenta: e.cuenta, url });
        if (url) callEngine("open_external", { target: url }).catch(() => {});
        return;
      }
    } catch {
      // Sin estado legible se trata como un intento que no llegó: la cuenta vacía se descarta.
    }
    await callEngine("remove_account", { provider: e.agente, id: e.cuenta }).catch(() => {});
    setErrores(e.fila, motivo ? explicar(motivo) : t("onboarding.ai.login_failed"));
    poner(e.fila, { k: "instalada" });
  }

  async function quedoConectada(id: string, agent: string, cuenta: string) {
    await callEngine("set_active_account", { provider: agent, id: cuenta }).catch(() => {});
    const conectada = await cuentaConectada(agent);
    poner(id, { k: "conectada", cuenta: conectada?.cuenta ?? "", id: cuenta });
  }

  /** Vuelve a preguntar por una cuenta que esperaba su alta: se conecta si ya quedó, sigue esperando si no. */
  async function revisarAlta(id: string) {
    const f = fila(id);
    const p = pasos[id];
    if (!f || p?.k !== "alta" || p.revisando) return;
    setErrores(id, null);
    poner(id, { ...p, revisando: true });
    try {
      const estado = await callEngine<AccountStatus>("account_status", { provider: f.agente, id: p.cuenta });
      if (pasos[id]?.k !== "alta") return;
      if (estado.authenticated) return void (await quedoConectada(id, f.agente, p.cuenta));
      if (estado.signup) return poner(id, { ...p, url: estado.signup.url ?? p.url, revisando: false });
      await callEngine("remove_account", { provider: f.agente, id: p.cuenta }).catch(() => {});
      setErrores(id, t("onboarding.ai.login_failed"));
      poner(id, { k: "instalada" });
    } catch {
      // Sin respuesta no se sabe nada nuevo: se sigue esperando y se vuelve a mirar al regresar.
      if (pasos[id]?.k === "alta") poner(id, { ...p, revisando: false });
    }
  }

  function abrirAlta(id: string) {
    const p = pasos[id];
    if (p?.k === "alta" && p.url) callEngine("open_external", { target: p.url }).catch(() => {});
  }

  async function enviarCodigo(id: string, codigo: string) {
    const p = pasos[id];
    if (p?.k !== "entrando" || !codigo.trim()) return;
    setErrores(id, null);
    poner(id, { ...p, pideCodigo: false });
    try {
      await callEngine("submit_login_code", { id: p.cuenta, code: codigo.trim() });
    } catch (e) {
      setErrores(id, explicar(e));
      poner(id, { ...p, pideCodigo: true });
    }
  }

  async function guardarClave(id: string, clave: string) {
    const f = fila(id);
    const v = clave.trim();
    if (!f || !v) return;
    setErrores(id, null);
    poner(id, { k: "comprobando" });
    try {
      const cuenta = await callEngine<{ id: string }>("connect_api_key", { provider: f.agente, key: v });
      poner(id, { k: "conectada", cuenta: t("onboarding.ai.key_saved", { start: v.slice(0, 4), end: v.slice(-4) }), id: cuenta.id });
    } catch (e) {
      const texto = explicar(e);
      setErrores(id, texto === t("onboarding.ai.error.keyring") ? texto : t("onboarding.ai.key_invalid"));
      poner(id, { k: "clave" });
    }
  }

  async function cancelar(id: string) {
    const p = pasos[id];
    setErrores(id, null);
    clearTimeout(plazo);
    if (p?.k === "entrando") {
      const e = entrada;
      entrada = null;
      cancelLoopbackForAccount(p.cuenta);
      await callEngine("cancel_login", { id: p.cuenta }).catch(() => {});
      if (e) await callEngine("discard_account", { provider: e.agente, id: e.cuenta }).catch(() => {});
    }
    const f = fila(id);
    if (p?.k === "alta" && f) await callEngine("remove_account", { provider: f.agente, id: p.cuenta }).catch(() => {});
    const sesion = sesionesDelSistema().find((x) => x.provider === f?.agente);
    poner(id, sesion ? { k: "sesion", identidad: sesion.identity ?? "" } : agente(f?.agente ?? "")?.available ? { k: "instalada" } : { k: "falta" });
  }

  async function desconectar(id: string) {
    const f = fila(id);
    const p = pasos[id];
    if (!f || p?.k !== "conectada") return;
    setErrores(id, null);
    poner(id, { k: "saliendo" });
    try {
      if (f.modo === "consentimiento") {
        const policy = await loadFreeModelPolicy();
        if (!policy) throw new Error(t("settings.accounts.free.unavailable"));
        await callEngine("set_provider_consent", { provider: f.agente, accepted: false }, freeModelScope(policy));
        window.dispatchEvent(new CustomEvent("harness:consentimiento"));
      } else {
        const lista = await callEngine<AccountList>("list_accounts", { provider: f.agente });
        for (const c of lista.accounts.filter((c) => c.authenticated_at !== null)) {
          await callEngine("remove_account", { provider: f.agente, id: c.id });
        }
      }
      poner(id, agente(f.agente)?.available ? { k: "instalada" } : { k: "falta" });
    } catch (e) {
      setErrores(id, explicar(e));
      poner(id, p);
    }
  }

  const alCuenta = listen<LoginEvent>("account", (ev) => {
    const e = entrada;
    const p = e ? pasos[e.fila] : undefined;
    if (!e || ev.payload.account !== e.cuenta || p?.k !== "entrando") return;
    const { kind, text } = ev.payload;
    if (kind === "url") {
      vigilarEntrada(e.fila, e.cuenta);
      poner(e.fila, { ...p, url: text });
      callEngine("open_external", { target: text }).catch(() => {});
    } else if (kind === "notice") setSalidas(e.fila, (s) => [...(s ?? []), text]);
    else if (kind === "confirm") poner(e.fila, { ...p, codigo: text });
    else if (kind === "code") poner(e.fila, { ...p, pideCodigo: true });
    else if (kind === "done") void terminarEntrada(text);
  });
  const alInstalar = listen<AvanceDeInstalacion>("install", (ev) => {
    const id = ev.payload.operation.startsWith("provider:") ? ev.payload.operation.slice(9) : null;
    if (!id || ev.payload.bytes <= 0) return;
    for (const f of filas().filter((x) => x.agente === id && pasos[x.id]?.k === "descargando")) {
      poner(f.id, { k: "descargando", hecho: ev.payload.done, total: ev.payload.bytes });
    }
  });
  const alAvance = listen<Avance>("toolchain", (ev) => {
    if (ev.payload.bytes <= 0) return;
    for (const f of filas().filter((x) => x.agente === ev.payload.id && pasos[x.id]?.k === "descargando")) {
      poner(f.id, { k: "descargando", hecho: ev.payload.done, total: ev.payload.bytes });
    }
  });
  const alAgentes = listen("providers", () => void cargar());
  // Lo que se instala o se activa en una página no avisa al motor: se vuelve a mirar al regresar a la ventana.
  const alVolver = () => {
    if (filas().some((f) => pasos[f.id]?.k === "externa")) void cargar();
    for (const f of filas().filter((x) => pasos[x.id]?.k === "alta")) void revisarAlta(f.id);
  };
  window.addEventListener("focus", alVolver);
  onCleanup(() => {
    cerrar();
    clearTimeout(plazo);
    window.removeEventListener("focus", alVolver);
    for (const l of [alCuenta, alAvance, alAgentes, alInstalar]) void l.then((f) => f());
    const e = entrada;
    if (e) {
      cancelLoopbackForAccount(e.cuenta);
      void callEngine("cancel_login", { id: e.cuenta }).catch(() => {});
      void callEngine("discard_account", { provider: e.agente, id: e.cuenta }).catch(() => {});
    }
    for (const f of filas()) {
      const p = pasos[f.id];
      if (p?.k === "alta") void callEngine("remove_account", { provider: f.agente, id: p.cuenta }).catch(() => {});
    }
  });

  return { conectar, usarSesion, cancelar, enviarCodigo, revisarAlta, abrirAlta, guardarClave, desconectar };
}
