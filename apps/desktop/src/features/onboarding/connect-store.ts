/**
 * Las IA que se conectan en el alta: qué hay en esta computadora, qué está
 * conectado en el workspace activo y en qué paso va cada conexión. El mapa y el
 * panel leen el mismo estado; las cuentas cuelgan del workspace activo.
 */

import { batch, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { acceptedFreeModelPolicy, freeModelScope, sameFreeModelPolicy, type FreeModelConsent, type FreeModelStartup } from "../../lib/free-model-policy.ts";
import { loadFreeModelPolicy } from "../../lib/free-model-policy-load.ts";
import type { Consentimiento } from "../settings/Accounts";
import { textoDeFalta } from "../../lib/no-space";

import { listen } from "../../lib/serviceEvents";
import type { Superficie } from "../../lib/surfaces.ts";
import { detalleDe, prosaDe } from "../../ui/Failure";
import { accountPresentation } from "../settings/AccountCard";
import { accountKeyUrl } from "../settings/account-auth";
import type { AccountList, AccountStatus, AgentOpt, LoginEvent } from "../settings/accounts-store";
import { ORIGEN_SISTEMA } from "../settings/environment-store";
import { crearModelosLocales } from "../settings/local-models-store";
import "../../locales/settingsPhrases";

type Agente = AgentOpt & { source: string | null; system_broken: boolean };
type Avance = { id: string; done: number; bytes: number };
type AvanceDeInstalacion = { operation: string; kind: string; done: number; bytes: number };
/** Una sesión ya iniciada en esta computadora, fuera de Terminus (`list_system_sessions`). */
type SesionDelSistema = { provider: string; identity: string | null; plan: string | null };

/** Los que se conectan con una clave pegada en su panel, como en el diseño: dónde se crea y cómo se ve. */
const CLAVES: Record<string, { url: string; placeholder: string }> = {
  grok: { url: "https://console.x.ai", placeholder: "xai-…" },
};
const CANCELADA = "install.cancelled";
const fueCancelada = (e: unknown) => `${prosaDe(e)} ${detalleDe(e)} ${String((e as { code?: string })?.code ?? "")}`.includes(CANCELADA);

/** Cómo se conecta: iniciando sesión con su CLI, pegando una clave, aceptando el aviso o en la máquina. */
export type Modo = "sesion" | "clave" | "consentimiento" | "local";

export type Fila = {
  id: string;
  agente: string;
  label: string;
  modo: Modo;
  /** El binario ya estaba en el sistema al abrir la pantalla; no cambia al conectarse. */
  detectada: boolean;
  /** Lo que baja si falta; `null` cuando ya está o no se sabe. */
  bytes: number | null;
  /** Dónde se consigue la clave, para el modo `clave`. */
  urlDeClave: string | null;
  /** El ejemplo del campo de la clave. */
  placeholder: string;
};

export type Paso =
  | { k: "falta" }
  | { k: "externa" }
  | { k: "sesion"; identidad: string }
  | { k: "instalada" }
  | { k: "descargando"; hecho: number; total: number }
  | { k: "entrando"; cuenta: string; url?: string; codigo?: string; pideCodigo?: boolean }
  | { k: "clave" }
  | { k: "comprobando" }
  | { k: "conectada"; cuenta: string; id: string | null }
  | { k: "saliendo" }
  /** La sesión se guardó y falta el alta del proveedor; `url` es la página que la completa. */
  | { k: "alta"; cuenta: string; url: string | null; revisando?: boolean };

const EN_CURSO = new Set<Paso["k"]>(["descargando", "entrando", "clave", "comprobando", "saliendo", "alta"]);
const ORDEN = ["claude", "codex", "antigravity", "grok", "opencode-zen", "opencode-local"];
/** ZCode va siempre al final, aunque esté en la computadora o el motor traiga proveedores nuevos. */
export const AL_FINAL = "zcode";
const posicion = (id: string) => {
  if (id === AL_FINAL) return ORDEN.length + 1;
  const i = ORDEN.indexOf(id);
  return i < 0 ? ORDEN.length : i;
};

/** El mapa pone los gratuitos entre Grok y OpenCode; el panel los deja debajo de OpenCode. */
export const ordenDelMapa = (filas: Fila[]) =>
  [...filas].sort((a, b) => rangoEnMapa(a) - rangoEnMapa(b));
const rangoEnMapa = (f: Fila) => (f.modo === "consentimiento" ? posicion("opencode-zen") - 0.5 : posicion(f.agente));

const SIN_LLAVERO = /secret service|org\.freedesktop\.secrets|secret-service|no keyring|keyring/i;

/** El error en palabras de quien usa la app: la falta de llavero se explica en vez de copiarse en crudo. */
export function explicar(e: unknown) {
  const texto = prosaDe(e);
  return SIN_LLAVERO.test(`${texto} ${detalleDe(e)}`) ? t("onboarding.ai.error.keyring") : texto;
}

/** El nombre de la fila; la de OpenCode con clave es la de Zen y Go, y la local nombra lo que da. */
export function nombreDeFila(f: Fila) {
  if (f.modo === "consentimiento") return t("surfaces.label.free");
  if (f.modo === "local") return t("onboarding.ai.local.name");
  if (f.agente === "antigravity" && f.modo === "sesion") return t("onboarding.ai.antigravity");
  if (f.agente.startsWith("opencode") && (f.modo === "clave" || f.modo === "sesion")) return "OpenCode";
  return f.label;
}

export function crearConexiones() {
  const [filas, setFilas] = createSignal<Fila[]>([]);
  const [pasos, setPasos] = createStore<Record<string, Paso>>({});
  const [errores, setErrores] = createStore<Record<string, string | null>>({});
  // Lo que el CLI dice mientras se inicia sesión, para «Ver lo que dice…».
  const [salidas, setSalidas] = createStore<Record<string, string[]>>({});
  const [falloDeCarga, setFalloDeCarga] = createSignal<string | null>(null);
  const [cargada, setCargada] = createSignal(false);
  const [pregunta, setPregunta] = createSignal<{ fila: string; texto: Consentimiento } | null>(null);
  const [guardando, setGuardando] = createSignal(false);
  // La fila local cuyo panel de modelos está abierto debajo de su tarjeta.
  const [localAbierto, setLocalAbierto] = createSignal<string | null>(null);
  // Vive con la pantalla y no con el panel: una descarga que sigue con el panel cerrado también conecta.
  const locales = crearModelosLocales();
  const listoLocal = () => t("onboarding.ai.local.ready", { model: locales.activo()?.label ?? "" });
  let agentes: Agente[] = [];
  let sesiones: SesionDelSistema[] = [];
  let detectadas: Set<string> | null = null;
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
      void invoke("cancel_login", { id: cuenta }).catch(() => {});
      void invoke("discard_account", { provider: e.agente, id: cuenta }).catch(() => {});
      setErrores(id, t("onboarding.ai.login_timeout"));
      poner(id, { k: "instalada" });
    }, PLAZO_DE_ENTRADA_MS);
  }
  // En serie: las filas de OpenCode comparten carpeta, y la segunda la encuentra ya instalada.
  let descargas: Promise<unknown> = Promise.resolve();
  let cerrada = false;

  const agente = (id: string) => agentes.find((a) => a.id === id);
  const fila = (id: string) => filas().find((f) => f.id === id);
  const enCurso = (id: string) => EN_CURSO.has(pasos[id]?.k ?? "falta");

  function poner(id: string, paso: Paso) {
    if (!cerrada) setPasos(id, paso);
  }

  async function cuentaConectada(agent: string): Promise<{ cuenta: string; id: string } | null> {
    const lista = await invoke<AccountList>("list_accounts", { provider: agent });
    const vivas = lista.accounts.filter((a) => a.authenticated_at !== null);
    const activa = vivas.find((a) => a.id === lista.active) ?? vivas[0];
    if (!activa) return null;
    const { name, plan } = accountPresentation(activa);
    return { cuenta: plan ? `${name} · ${plan}` : name, id: activa.id };
  }

  async function consentida() {
    return (await loadFreeModelPolicy())?.accepted ?? false;
  }

  async function pasoGuardado(f: Fila): Promise<Paso> {
    const a = agente(f.agente);
    // El binario que Terminus bajó para otra fila del mismo agente no cuenta como instalado en el sistema.
    const base: Paso = a?.available && (f.detectada || f.modo !== "clave") ? { k: "instalada" } : { k: "falta" };
    try {
      if (f.modo === "consentimiento") {
        return a?.available && (await consentida())
          ? { k: "conectada", cuenta: t("settings.accounts.free.warning_short"), id: null }
          : base;
      }
      if (f.modo === "local") {
        await locales.cargar();
        return a?.available && locales.listo() ? { k: "conectada", cuenta: listoLocal(), id: null } : base;
      }
      const conectada = await cuentaConectada(f.agente);
      if (conectada) return { k: "conectada", ...conectada };
      const sesion = sesiones.find((x) => x.provider === f.agente);
      return sesion ? { k: "sesion", identidad: sesion.identity ?? "" } : base;
    } catch {
      return base;
    }
  }

  // La tarjeta local queda conectada cuando hay llama.cpp y un modelo bajado, y dice cuál usan las tareas.
  createEffect(() => {
    const listo = locales.listo();
    const cuenta = listoLocal();
    for (const f of filas().filter((x) => x.modo === "local")) {
      const p = untrack(() => pasos[f.id]);
      if (listo && agente(f.agente)?.available && (p?.k === "instalada" || (p?.k === "conectada" && p.cuenta !== cuenta))) {
        poner(f.id, { k: "conectada", cuenta, id: null });
      } else if (!listo && p?.k === "conectada") {
        poner(f.id, { k: "instalada" });
      }
    }
  });

  async function cargar() {
    let superficies: Superficie[] = [];
    try {
      [agentes, superficies, sesiones] = await Promise.all([
        invoke<Agente[]>("list_providers"),
        invoke<Superficie[]>("list_surfaces").catch(() => [] as Superficie[]),
        invoke<SesionDelSistema[]>("list_system_sessions").catch(() => [] as SesionDelSistema[]),
      ]);
    } catch (e) {
      setFalloDeCarga(prosaDe(e));
      return;
    }
    if (cerrada) return;
    setFalloDeCarga(null);
    detectadas ??= new Set(
      [
        ...agentes.filter((a) => a.available && a.source === ORIGEN_SISTEMA && !a.system_broken).map((a) => a.id),
        ...sesiones.map((x) => x.provider),
      ],
    );
    const nuevas: Fila[] = [];
    for (const a of [...agentes].sort((x, y) => posicion(x.id) - posicion(y.id))) {
      // Con superficie gratuita aparte, la fila del agente es la de pago: se conecta con su cuenta.
      const gratuitas = superficies.filter((x) => x.provider === a.id && x.catalogo === "gratuitos");
      const modo: Modo =
        a.inferencia === "en_la_maquina"
          ? "local"
          : a.inferencia === "sin_pedir_nada" && gratuitas.length === 0
            ? "consentimiento"
            : accountKeyUrl(a) || CLAVES[a.id]
              ? "clave"
              : "sesion";
      const previa = filas().find((f) => f.id === a.id);
      nuevas.push({
        id: a.id,
        agente: a.id,
        label: a.label,
        modo,
        detectada: detectadas.has(a.id),
        bytes: previa?.bytes ?? null,
        urlDeClave: CLAVES[a.id]?.url ?? accountKeyUrl(a),
        placeholder: CLAVES[a.id]?.placeholder ?? "",
      });
      for (const s of gratuitas) {
        nuevas.push({
          id: s.id,
          agente: a.id,
          label: t("surfaces.label.free"),
          modo: "consentimiento",
          detectada: false,
          bytes: previa?.bytes ?? null,
          urlDeClave: null,
          placeholder: "",
        });
      }
    }
    setFilas(nuevas);
    const estados = await Promise.all(nuevas.map((f) => pasoGuardado(f)));
    batch(() => {
      nuevas.forEach((f, i) => {
        // Quien fue a instalarlo a su página sigue viendo esa indicación hasta que el binario aparece.
        const esperaExterna = pasos[f.id]?.k === "externa" && estados[i].k === "falta";
        if (!enCurso(f.id) && !esperaExterna) poner(f.id, estados[i]);
      });
      setCargada(true);
    });
    for (const f of nuevas) {
      const a = agente(f.agente);
      if (!a || a.available || a.external_install_url || f.bytes !== null) continue;
      invoke<number>("provider_download_size", { provider: a.id })
        .then((b) => setFilas((fs) => fs.map((x) => (x.agente === a.id ? { ...x, bytes: b } : x))))
        .catch(() => {});
    }
  }

  async function descargar(f: Fila): Promise<boolean> {
    const total = f.bytes ?? 0;
    poner(f.id, { k: "descargando", hecho: 0, total });
    const vuelta = descargas.then(async () => {
      if (agente(f.agente)?.available) return true;
      await invoke("install_provider", { provider: f.agente });
      return true;
    });
    descargas = vuelta.catch(() => {});
    try {
      await vuelta;
      agentes = agentes.map((a) => (a.id === f.agente ? { ...a, available: true } : a));
      for (const x of filas().filter((x) => x.agente === f.agente && pasos[x.id]?.k === "descargando")) {
        poner(x.id, { k: "instalada" });
      }
      return true;
    } catch (e) {
      if (!fueCancelada(e)) setErrores(f.id, explicar(e));
      for (const x of filas().filter((x) => x.agente === f.agente && pasos[x.id]?.k === "descargando")) {
        poner(x.id, sesiones.some((y) => y.provider === f.agente) ? { k: "instalada" } : { k: "falta" });
      }
      const sinEspacio = await textoDeFalta(e, `provider:${f.agente}`);
      if (sinEspacio && errores[f.id]) setErrores(f.id, sinEspacio);
      return false;
    }
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
        invoke("open_external", { target: a.external_install_url }).catch(() => {});
        return;
      }
      if (!(await descargar(f))) return;
    }
    if (f.modo === "local") {
      setLocalAbierto(id);
      if (locales.listo()) poner(id, { k: "conectada", cuenta: listoLocal(), id: null });
      return;
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
      const cuenta = await invoke<{ id: string }>("adopt_system_session", { provider: f.agente });
      const conectada = await cuentaConectada(f.agente);
      poner(id, { k: "conectada", cuenta: conectada?.cuenta ?? p.identidad, id: cuenta.id });
    } catch (e) {
      setErrores(id, explicar(e));
      poner(id, p);
    }
  }

  /** La × de la descarga: el motor la corta y no deja nada a medias. */
  function cancelarDescarga(id: string) {
    const f = fila(id);
    if (!f) return;
    // La tarjeta vuelve al instante; el motor termina de cortar por detrás.
    poner(id, sesiones.some((y) => y.provider === f.agente) ? { k: "instalada" } : { k: "falta" });
    void invoke("cancel_install", { operation: `provider:${f.agente}` }).catch(() => {});
  }

  async function entrar(id: string) {
    const f = fila(id);
    if (!f) return;
    let cuenta: string | null = null;
    try {
      cuenta = (await invoke<{ id: string }>("add_account", { provider: f.agente, label: "" })).id;
      entrada = { fila: id, agente: f.agente, cuenta };
      setSalidas(id, []);
      poner(id, { k: "entrando", cuenta });
      await invoke("login_account", { provider: f.agente, id: cuenta, mode: "tuberia" });
    } catch (e) {
      entrada = null;
      if (cuenta) await invoke("discard_account", { provider: f.agente, id: cuenta }).catch(() => {});
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
      const estado = await invoke<AccountStatus>("account_status", { provider: e.agente, id: e.cuenta });
      if (!motivo && estado.authenticated) return void (await quedoConectada(e.fila, e.agente, e.cuenta));
      // La cuenta se queda: ya tiene la sesión, y en cuanto el alta exista se conecta sin volver a entrar.
      if (!motivo && estado.signup) {
        const url = estado.signup.url;
        poner(e.fila, { k: "alta", cuenta: e.cuenta, url });
        if (url) invoke("open_external", { target: url }).catch(() => {});
        return;
      }
    } catch {
      // Sin estado legible se trata como un intento que no llegó: la cuenta vacía se descarta.
    }
    await invoke("remove_account", { provider: e.agente, id: e.cuenta }).catch(() => {});
    setErrores(e.fila, motivo ? explicar(motivo) : t("onboarding.ai.login_failed"));
    poner(e.fila, { k: "instalada" });
  }

  async function quedoConectada(id: string, agent: string, cuenta: string) {
    await invoke("set_active_account", { provider: agent, id: cuenta }).catch(() => {});
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
      const estado = await invoke<AccountStatus>("account_status", { provider: f.agente, id: p.cuenta });
      if (pasos[id]?.k !== "alta") return;
      if (estado.authenticated) return void (await quedoConectada(id, f.agente, p.cuenta));
      if (estado.signup) return poner(id, { ...p, url: estado.signup.url ?? p.url, revisando: false });
      await invoke("remove_account", { provider: f.agente, id: p.cuenta }).catch(() => {});
      setErrores(id, t("onboarding.ai.login_failed"));
      poner(id, { k: "instalada" });
    } catch {
      // Sin respuesta no se sabe nada nuevo: se sigue esperando y se vuelve a mirar al regresar.
      if (pasos[id]?.k === "alta") poner(id, { ...p, revisando: false });
    }
  }

  function abrirAlta(id: string) {
    const p = pasos[id];
    if (p?.k === "alta" && p.url) invoke("open_external", { target: p.url }).catch(() => {});
  }

  async function enviarCodigo(id: string, codigo: string) {
    const p = pasos[id];
    if (p?.k !== "entrando" || !codigo.trim()) return;
    setErrores(id, null);
    poner(id, { ...p, pideCodigo: false });
    try {
      await invoke("submit_login_code", { id: p.cuenta, code: codigo.trim() });
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
      const cuenta = await invoke<{ id: string }>("connect_api_key", { provider: f.agente, key: v });
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
      await invoke("cancel_login", { id: p.cuenta }).catch(() => {});
      if (e) await invoke("discard_account", { provider: e.agente, id: e.cuenta }).catch(() => {});
    }
    const f = fila(id);
    if (p?.k === "alta" && f) await invoke("remove_account", { provider: f.agente, id: p.cuenta }).catch(() => {});
    const sesion = sesiones.find((x) => x.provider === f?.agente);
    poner(id, sesion ? { k: "sesion", identidad: sesion.identity ?? "" } : agente(f?.agente ?? "")?.available ? { k: "instalada" } : { k: "falta" });
  }

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
      const startup = await invoke<FreeModelStartup>("workspaces_startup");
      if (startup.active !== policy.workspace_id || !sameFreeModelPolicy(policy, await loadFreeModelPolicy(policy))) throw new Error(t("settings.accounts.free.policy_changed"));
      const workspace = await invoke<{ free_model_consent?: FreeModelConsent }>("set_provider_consent", {
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
        await invoke("set_provider_consent", { provider: f.agente, accepted: false }, freeModelScope(policy));
        window.dispatchEvent(new CustomEvent("harness:consentimiento"));
      } else if (f.modo === "local") {
        await invoke("remove_local_runtime");
        setLocalAbierto(null);
        await locales.cargar();
      } else {
        const lista = await invoke<AccountList>("list_accounts", { provider: f.agente });
        for (const c of lista.accounts.filter((c) => c.authenticated_at !== null)) {
          await invoke("remove_account", { provider: f.agente, id: c.id });
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
      invoke("open_external", { target: text }).catch(() => {});
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
    cerrada = true;
    clearTimeout(plazo);
    window.removeEventListener("focus", alVolver);
    for (const l of [alCuenta, alAvance, alAgentes, alInstalar]) void l.then((f) => f());
    const e = entrada;
    if (e) {
      void invoke("cancel_login", { id: e.cuenta }).catch(() => {});
      void invoke("discard_account", { provider: e.agente, id: e.cuenta }).catch(() => {});
    }
    for (const f of filas()) {
      const p = pasos[f.id];
      if (p?.k === "alta") void invoke("remove_account", { provider: f.agente, id: p.cuenta }).catch(() => {});
    }
  });

  const conectadas = () => filas().filter((f) => pasos[f.id]?.k === "conectada");

  return {
    filas,
    pregunta,
    guardando,
    responder,
    pasos,
    errores,
    salidas,
    falloDeCarga,
    cargada,
    conectadas,
    nombre: nombreDeFila,
    /** Su CLI se instala desde la página del fabricante, no lo baja Terminus. */
    externa: (f: Fila) => Boolean(agente(f.agente)?.external_install_url && !agente(f.agente)?.available),
    cargar,
    conectar,
    locales,
    localAbierto,
    /** Abre o cierra el panel de modelos debajo de la tarjeta local. */
    alternarLocal: (id: string) => setLocalAbierto((a) => (a === id ? null : id)),
    cerrarLocal: () => setLocalAbierto(null),
    usarSesion,
    cancelarDescarga,
    cancelar,
    enviarCodigo,
    revisarAlta,
    abrirAlta,
    guardarClave,
    desconectar,
    limpiarError: (id: string) => setErrores(id, null),
  };
}

export type Conexiones = ReturnType<typeof crearConexiones>;
