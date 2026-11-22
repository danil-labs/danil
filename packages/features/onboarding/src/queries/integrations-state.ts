import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { isMac } from "../../../../host/src/window";
import { explicar } from "./connect-store";
import {
  getWorkspaceScope,
  setGoogleDriveDesktopUse,
  type AgenteMcp,
  type AvanceDeDrive,
  type Conocido,
  type DriveDeEscritorio,
  type EstadoDeDrive,
  type EstadoDeZotero,
  type Proveedor,
  type VinculoBib,
} from "../queries";
import {
  type Borrador,
  type EstadoDeIntegracion,
  INTEGRACIONES,
  type Integracion,
  type IntegracionesProps,
  SIN_BORRADOR,
  descripcion,
} from "../model/tool-cards";

/** El estado de las tarjetas de integraciones y lo que se deriva de él, sin efectos. */
export function createEstadoDeIntegraciones(props: IntegracionesProps) {
  /** Con `solo`, únicamente esas tarjetas y todas a la vista: Configuración monta así la de Drive. */
  const integraciones = () =>
    props.solo
      ? INTEGRACIONES()
          .filter((i) => props.solo?.includes(i.id))
          .map((i) => ({ ...i, comun: true }))
      : INTEGRACIONES();
  const [proveedores, setProveedores] = createSignal<Proveedor[]>([]);
  const [conocidos, setConocidos] = createSignal<Conocido[]>([]);
  const [agentesMcp, setAgentesMcp] = createSignal<AgenteMcp[]>([]);
  const [estados, setEstados] = createStore<Record<string, EstadoDeIntegracion>>({});
  const [errores, setErrores] = createStore<Record<string, string | null>>({});
  const [borradores, setBorradores] = createStore<Record<string, Borrador>>({});
  /** Por qué se abrió el formulario en vez del navegador: el aviso del servicio, entero. */
  const [motivos, setMotivos] = createStore<Record<string, string | null>>({});
  const [verMas, setVerMas] = createSignal(false);
  const [falloDeCarga, setFalloDeCarga] = createSignal<string | null>(null);
  const [drive, setDrive] = createSignal<EstadoDeDrive | null>(null);
  const [escritorio, setEscritorio] = createSignal<DriveDeEscritorio | null>(null);
  const [zotero, setZotero] = createSignal<EstadoDeZotero | null>(null);
  const [bibs, setBibs] = createSignal<VinculoBib[]>([]);
  const [sincronizandoBibs, setSincronizandoBibs] = createSignal(false);
  const oficial = () => escritorio()?.supported === true;
  const scope = getWorkspaceScope();

  const agenteDeSesion = () => agentesMcp().find((a) => a.instalado && a.recibe && a.login);
  const proveedor = (id: string) => proveedores().find((p) => p.id === id);
  const conocido = (i: Integracion) => conocidos().find((c) => c.id === i.id);
  const descargaDeDrive = (a: AvanceDeDrive | null | undefined): EstadoDeIntegracion | null =>
    a && (a.kind === "progress" || a.kind === "verifying")
      ? { k: "descargando", hecho: a.received ?? 0, total: a.total ?? null }
      : null;
  const viva = (id: string) =>
    ["formulario", "descargando", "instalando", "sesion", "conectando", "abriendo", "saliendo"].includes(estados[id]?.k ?? "libre");
  const unidad = (d: DriveDeEscritorio | null) => d?.mounts?.[0];
  const borrador = (id: string) => borradores[id] ?? SIN_BORRADOR;

  function guardado(i: Integracion): EstadoDeIntegracion {
    if (i.id === "zotero") {
      const z = zotero();
      if (!z?.running) return { k: "libre" };
      if (z.local_api === "ready") return { k: "conectada", detalle: t("onboarding.tools.references.zotero_ready", { version: z.version ?? "" }) };
      return z.local_api === "disabled" ? { k: "permiso" } : { k: "libre" };
    }
    if (i.via === "drive" && oficial()) {
      const m = unidad(escritorio());
      if (!m) return { k: "libre" };
      const donde = [m.email, m.path].filter(Boolean).join(" · ");
      return escritorio()?.unused ? { k: "detectada", detalle: donde } : { k: "conectada", detalle: donde };
    }
    if (i.via === "drive") {
      const d = drive();
      if (d?.connected) return { k: "conectada", detalle: d.connected.email || d.connected.name };
      return descargaDeDrive(d?.install) ?? { k: "libre" };
    }
    if (i.via === "proveedor") {
      const c = proveedor(i.id)?.connected;
      if (!c) return { k: "libre" };
      const quien = c.identity.name && c.identity.user ? `${c.identity.name} · @${c.identity.user}` : c.identity.user || c.workspace || "";
      return { k: "conectada", detalle: quien };
    }
    const c = conocido(i);
    if (!c?.conectado) return { k: "libre" };
    if (!c.pide_sesion || (c.sesiones ?? []).length > 0) return { k: "conectada", detalle: descripcion(i.id) };
    return { k: "detectada", detalle: t("onboarding.tools.needs_login") };
  }

  /** El respaldo de Configuración: pegar un token cuando el navegador no se pudo usar. */
  function abrirFormulario(i: Integracion, motivo: string | null) {
    setMotivos(i.id, motivo);
    setEstados(i.id, { k: "formulario" });
  }

  const contarConectadas = () => props.onCambio(integraciones().filter((x) => estados[x.id]?.k === "conectada").length);

  function usarUnidad(i: Integracion, o: DriveDeEscritorio) {
    setEscritorio({ ...o, unused: false });
    void setGoogleDriveDesktopUse(true).catch((e) => setErrores(i.id, explicar(e)));
    setEstados(i.id, guardado(i));
    contarConectadas();
  }

  /** Con Zotero abierto la tarjeta dice lo que sigue: lista, falta el permiso en Zotero o hay que actualizarlo. */
  function segunZotero(i: Integracion, z: EstadoDeZotero) {
    setZotero(z);
    if (z.local_api === "unsupported") {
      setErrores(i.id, t("settings.references.zotero.error_too_old"));
      setEstados(i.id, { k: "libre" });
    } else setEstados(i.id, guardado(i));
    contarConectadas();
  }

  const formularioAbierto = (i: Integracion) =>
    i.via === "proveedor" && (estados[i.id]?.k === "formulario" || (estados[i.id]?.k === "conectando" && Boolean(borradores[i.id]?.token)));

  const detalle = (i: Integracion) => {
    const e = estados[i.id];
    if (i.via === "incluido") return descripcion(i.id);
    switch (e?.k) {
      case "conectada":
        return e.detalle;
      case "formulario":
        return t("onboarding.tools.fill_below");
      case "detectada":
        return i.via === "drive" ? t("onboarding.tools.drive_app.unused", { where: e.detalle }) : e.detalle;
      case "descargando":
        if (i.id === "zotero") return t("onboarding.tools.references.zotero_downloading");
        return i.via === "drive" && oficial() ? t("onboarding.tools.drive_app.downloading") : t("onboarding.tools.downloading_cli_start");
      case "instalando":
        if (i.id === "zotero") return t("onboarding.tools.references.zotero_installing");
        return isMac() ? t("onboarding.tools.drive_app.installing_mac") : t("onboarding.tools.drive_app.installing_windows");
      case "abriendo":
        return t("onboarding.tools.references.zotero_opening");
      case "permiso":
        return t("onboarding.tools.references.zotero_permission");
      case "sesion":
        return t("onboarding.tools.drive_app.sign_in");
      case "conectando":
        if (formularioAbierto(i)) return t("onboarding.tools.checking_token");
        if (e.codigo) return t("onboarding.login.confirm_in_browser");
        return t("onboarding.tools.finish_in_browser");
      case "saliendo":
        return t("onboarding.ai.disconnecting");
      default:
        if (i.id === "zotero" && zotero()?.installed && !zotero()?.running) return t("onboarding.tools.references.zotero_closed");
        return descripcion(i.id);
    }
  };

  return {
    integraciones, proveedores, setProveedores, conocidos, setConocidos, agentesMcp, setAgentesMcp, estados, setEstados, errores, setErrores, borradores, setBorradores, motivos, setMotivos, verMas, setVerMas, falloDeCarga, setFalloDeCarga, drive, setDrive, escritorio, setEscritorio, zotero, setZotero, bibs, setBibs, sincronizandoBibs, setSincronizandoBibs, oficial, scope, agenteDeSesion, proveedor, conocido, descargaDeDrive, viva, unidad, borrador, guardado, abrirFormulario, contarConectadas, usarUnidad, segunZotero, formularioAbierto, detalle,
  };
}

export type EstadoDeIntegraciones = ReturnType<typeof createEstadoDeIntegraciones>;
