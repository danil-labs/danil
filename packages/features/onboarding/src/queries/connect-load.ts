import { batch } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { invoke } from "../../../../engine-client/src/client.ts";
import { loadFreeModelPolicy } from "../../../../../apps/desktop/src/lib/free-model-policy-load.ts";
import { textoDeFalta } from "../../../../../apps/desktop/src/lib/no-space";
import type { Superficie } from "../../../../../apps/desktop/src/lib/surfaces.ts";
import { prosaDe } from "../../../../ui/src/Failure";
import { accountKeyUrl } from "../../../settings/src/model/account-auth";
import { ORIGEN_SISTEMA } from "../../../settings/src/model/environment-store";
import { canonicalAgentId, isFreeRouterAgent, isRetiredAgent } from "../../../../tasks/src/agents.ts";
import { CLAVES, EN_CURSO, explicar, type Fila, fueCancelada, type Modo, type Paso, posicion } from "./connect-rows";
import { type Agente, cuentaConectada } from "./connect-login";
import type { EstadoDeConexiones } from "./connect-state";

/** Una sesión ya iniciada en esta computadora, fuera de Terminus (`list_system_sessions`). */
type SesionDelSistema = { provider: string; identity: string | null; plan: string | null };

/** Lo que hay en esta computadora: carga los proveedores, el paso guardado de cada fila y las descargas. */
export function crearCargaDeConexiones(estado: EstadoDeConexiones) {
  const { filas, setFilas, pasos, setPasos, errores, setErrores, setFalloDeCarga, setCargada } = estado;
  let agentes: Agente[] = [];
  let sesiones: SesionDelSistema[] = [];
  let detectadas: Set<string> | null = null;
  // En serie: las filas de OpenCode comparten carpeta, y la segunda la encuentra ya instalada.
  let descargas: Promise<unknown> = Promise.resolve();
  let cerrada = false;

  const agente = (id: string) => agentes.find((a) => a.id === id);
  const fila = (id: string) => filas().find((f) => f.id === id);
  const enCurso = (id: string) => EN_CURSO.has(pasos[id]?.k ?? "falta");

  function poner(id: string, paso: Paso) {
    if (!cerrada) setPasos(id, paso);
  }

  async function consentida() {
    const policy = await loadFreeModelPolicy();
    return policy?.accepted ? policy : null;
  }

  async function pasoGuardado(f: Fila): Promise<Paso> {
    const a = agente(f.agente);
    // El binario que Terminus bajó para otra fila del mismo agente no cuenta como instalado en el sistema.
    const base: Paso = a?.available && (f.detectada || f.modo !== "clave") ? { k: "instalada" } : { k: "falta" };
    try {
      if (f.modo === "consentimiento") {
        const policy = await consentida();
        return a?.available && policy
          ? { k: "conectada", cuenta: policy.enabled ? t("settings.accounts.free.warning_short") : t("settings.accounts.free.paused"), id: null }
          : base;
      }
      const conectada = await cuentaConectada(f.agente);
      if (conectada) return { k: "conectada", ...conectada };
      const sesion = sesiones.find((x) => x.provider === f.agente);
      return sesion ? { k: "sesion", identidad: sesion.identity ?? "" } : base;
    } catch {
      return base;
    }
  }

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
    // Un motor anterior aún manda `opencode-local` (retirado) y `opencode-zen`: la fila usa el id actual.
    const vigentes = agentes.filter((a) => !isRetiredAgent(a.id));
    for (const a of vigentes.sort((x, y) => posicion(canonicalAgentId(x.id)) - posicion(canonicalAgentId(y.id)))) {
      const id = canonicalAgentId(a.id);
      if (nuevas.some((f) => f.id === id)) continue;
      // El Free Router (`free-router-<motor>`) no tiene cuenta: su fila es solo el consentimiento.
      const router = isFreeRouterAgent(a.id) || a.free_router === true;
      // Un motor anterior parte su fila de OpenCode en dos: la de pago y una superficie gratuita aparte.
      const gratuitas = router ? [] : superficies.filter((x) => x.provider === a.id && x.catalogo === "gratuitos");
      const modo: Modo =
        router || (a.inferencia === "sin_pedir_nada" && gratuitas.length === 0)
          ? "consentimiento"
          : accountKeyUrl(a) || CLAVES[a.id]
            ? "clave"
            : "sesion";
      const previa = filas().find((f) => f.id === id);
      nuevas.push({
        id,
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

  /** La × de la descarga: el motor la corta y no deja nada a medias. */
  function cancelarDescarga(id: string) {
    const f = fila(id);
    if (!f) return;
    // La tarjeta vuelve al instante; el motor termina de cortar por detrás.
    poner(id, sesiones.some((y) => y.provider === f.agente) ? { k: "instalada" } : { k: "falta" });
    void invoke("cancel_install", { operation: `provider:${f.agente}` }).catch(() => {});
  }

  return {
    agente,
    fila,
    enCurso,
    poner,
    cargar,
    descargar,
    cancelarDescarga,
    sesionesDelSistema: () => sesiones,
    cerrar: () => {
      cerrada = true;
    },
  };
}

export type CargaDeConexiones = ReturnType<typeof crearCargaDeConexiones>;
