import { listen } from "../../../../../apps/desktop/src/lib/serviceEvents";
import { onCleanup, onMount } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { borrarPref, leerPref } from "../../../../../apps/desktop/src/lib/prefs";
import { explicar } from "./connect-store";
import {
  cancelBrowserLogin,
  cancelGoogleDriveLogin,
  cancelInstall,
  checkGoogleDrive,
  connectKnownMcp,
  disconnectKnownMcp,
  finishBrowserLogin,
  finishGoogleDriveLogin,
  getGoogleDriveDesktopStatus,
  getGoogleDriveStatus,
  getInstallSize,
  getZoteroBibLinks,
  getZoteroStatus,
  installGh,
  installGoogleDrive,
  installGoogleDriveDesktop,
  installZotero,
  listGitHosts,
  listKnownMcp,
  listMcpProviders,
  mcpLogin,
  openExternal,
  openGoogleDriveDesktop,
  openZotero,
  setGoogleDriveDesktopUse,
  startBrowserLogin,
  startGoogleDriveLogin,
  type AvanceDeDrive,
  type InstalacionDeDrive,
} from "../queries";
import {
  CADA_CUANTO_SESION,
  INTEGRACIONES,
  type Integracion,
  type IntegracionesProps,
  SIN_BORRADOR,
  SIN_USAR_DRIVE,
  falloDeInstalacion,
} from "../model/tool-cards";
import type { EstadoDeIntegraciones } from "./integrations-state";

/** Cargar, escuchar al motor, conectar y cancelar: lo que comparte los intentos y vigías de cada tarjeta. */
export function createConexiones(props: IntegracionesProps, estado: EstadoDeIntegraciones) {
  const { integraciones, setProveedores, setConocidos, setAgentesMcp, estados, setEstados, setErrores, borradores, setBorradores, setMotivos, setFalloDeCarga, drive, setDrive, escritorio, setEscritorio, setZotero, setBibs, oficial, scope, agenteDeSesion, proveedor, conocido, descargaDeDrive, viva, unidad, guardado, abrirFormulario, usarUnidad, segunZotero } = estado;
  let intentoDeZotero = 0;
  let finDeZotero: ((a: InstalacionDeDrive) => void) | null = null;
  let vigiaDeZotero: ReturnType<typeof setTimeout> | undefined;
  /** Cada «Conectar» de la app oficial: lo que conteste uno ya cancelado no toca la tarjeta. */
  let intentoDeDrive = 0;
  let finDeInstalacion: ((a: InstalacionDeDrive) => void) | null = null;
  let vigiaDeSesion: ReturnType<typeof setTimeout> | undefined;
  let finDeDescarga: ((a: AvanceDeDrive) => void) | null = null;
  let esperandoMcp: string | null = null;
  let incluidas = false;
  let cerrada = false;

  async function cargar() {
    try {
      const [p, c, a, d, o, z, b] = await Promise.all([
        listGitHosts(await scope),
        listKnownMcp(),
        listMcpProviders(),
        getGoogleDriveStatus().catch(() => null),
        getGoogleDriveDesktopStatus().catch(() => null),
        getZoteroStatus().catch(() => null),
        getZoteroBibLinks().catch(() => []),
      ]);
      if (cerrada) return;
      // Antes la guardaba la ventana; ahora es del motor, que la lee en cada turno.
      if (o && leerPref(SIN_USAR_DRIVE, false)) {
        borrarPref(SIN_USAR_DRIVE);
        if (!o.unused) {
          await setGoogleDriveDesktopUse(false).catch(() => {});
          o.unused = true;
        }
      }
      setDrive(d);
      setEscritorio(o);
      setZotero(z);
      setBibs(b);
      setProveedores(p);
      setConocidos(c);
      setAgentesMcp(a);
      setFalloDeCarga(null);
      for (const i of integraciones()) if (!viva(i.id)) setEstados(i.id, guardado(i));
      props.onCambio(integraciones().filter((i) => estados[i.id]?.k === "conectada").length);
      void incluir();
    } catch (e) {
      setFalloDeCarga(explicar(e));
    }
  }

  /** Lo incluido no pide nada: se deja puesto en el workspace al abrir la pantalla. */
  async function incluir() {
    if (incluidas) return;
    incluidas = true;
    for (const i of integraciones().filter((x) => x.via === "incluido")) {
      const c = conocido(i);
      if (!c || c.conectado) continue;
      try {
        await connectKnownMcp(i.id);
      } catch (e) {
        setErrores(i.id, explicar(e));
      }
    }
    if (!cerrada) await cargar();
  }

  onMount(() => void cargar());
  const fin = listen("mcp", () => {
    if (esperandoMcp) setEstados(esperandoMcp, { k: "libre" });
    esperandoMcp = null;
    void cargar();
  });
  // `mcp-login` no se abre aquí: el CLI o el motor ya abrieron esa pestaña.
  const alDrive = listen<AvanceDeDrive>("google-drive", (e) => {
    const a = e.payload;
    if (a.kind === "connection") return void cargar();
    const bajando = descargaDeDrive(a);
    if (bajando) {
      if (estados.drive?.k === "descargando" || finDeDescarga) setEstados("drive", bajando);
      return;
    }
    finDeDescarga?.(a);
  });
  // Al abrir se pregunta a Google si la conexión sigue viva; sin red queda conectada y sin comprobar.
  onMount(async () => {
    const o = await getGoogleDriveDesktopStatus().catch(() => null);
    if (o?.supported) return;
    void getGoogleDriveStatus()
      .then((d) => (d.connected ? checkGoogleDrive() : d))
      .then((d) => {
        if (cerrada) return;
        setDrive(d);
        if (!viva("drive")) setEstados("drive", guardado(INTEGRACIONES().find((i) => i.id === "drive")!));
      })
      .catch((e) => {
        setErrores("drive", explicar(e));
        void cargar();
      });
  });
  const alInstalarZotero = listen<InstalacionDeDrive>("install", (e) => {
    const a = e.payload;
    if (a.operation !== "zotero") return;
    if (a.kind === "done" || a.kind === "cancelled" || a.kind === "error") return finDeZotero?.(a);
    if (estados.zotero?.k !== "descargando" && estados.zotero?.k !== "instalando") return;
    if (a.kind === "installing") setEstados("zotero", { k: "instalando" });
    else if (a.bytes > 0) setEstados("zotero", { k: "descargando", hecho: a.done, total: a.bytes });
  });
  const alInstalar = listen<InstalacionDeDrive>("install", (e) => {
    const a = e.payload;
    if (a.operation !== "google-drive-desktop") return;
    if (a.kind === "done" || a.kind === "cancelled" || a.kind === "error") return finDeInstalacion?.(a);
    if (estados.drive?.k !== "descargando") return;
    if (a.kind === "installing") setEstados("drive", { k: "instalando" });
    else if (a.bytes > 0) setEstados("drive", { k: "descargando", hecho: a.done, total: a.bytes });
  });
  onCleanup(() => {
    cerrada = true;
    clearTimeout(vigiaDeSesion);
    clearTimeout(vigiaDeZotero);
    for (const l of [fin, alDrive, alInstalar, alInstalarZotero]) void l.then((f) => f());
    for (const i of integraciones()) {
      if ((i.via === "proveedor" || i.via === "drive") && estados[i.id]?.k === "conectando") void cancelar(i);
    }
  });

  /** Mientras la persona inicia sesión en la app de Google, la tarjeta pasa sola a conectada cuando aparece la unidad. */
  function vigilarSesion(i: Integracion, intento: number) {
    clearTimeout(vigiaDeSesion);
    vigiaDeSesion = setTimeout(async () => {
      const o = await getGoogleDriveDesktopStatus().catch(() => null);
      if (cerrada || intento !== intentoDeDrive || estados[i.id]?.k !== "sesion") return;
      if (o && unidad(o)) return usarUnidad(i, o);
      vigilarSesion(i, intento);
    }, CADA_CUANTO_SESION);
  }

  /** La app oficial de Google se descarga e instala sola; la persona acepta el permiso del sistema e inicia sesión. */
  async function conectarDriveDeEscritorio(i: Integracion) {
    const intento = ++intentoDeDrive;
    const vigente = () => !cerrada && intento === intentoDeDrive;
    const antes = escritorio()!;
    if (unidad(antes)) return usarUnidad(i, antes);
    try {
      if (antes.installed) await openGoogleDriveDesktop();
      else {
        setEstados(i.id, { k: "descargando", hecho: 0, total: antes.installer_bytes });
        const terminada = new Promise<InstalacionDeDrive>((resolve) => (finDeInstalacion = resolve));
        await installGoogleDriveDesktop();
        const a = await terminada;
        finDeInstalacion = null;
        if (!vigente() || a.kind === "cancelled") return;
        if (a.kind === "error") throw new Error(falloDeInstalacion(a.failure));
      }
      if (!vigente()) return;
      const o = await getGoogleDriveDesktopStatus();
      if (!vigente()) return;
      if (unidad(o)) return usarUnidad(i, o);
      setEscritorio(o);
      setEstados(i.id, { k: "sesion" });
      vigilarSesion(i, intento);
    } catch (e) {
      finDeInstalacion = null;
      if (!vigente()) return;
      setErrores(i.id, explicar(e) || t("onboarding.tools.drive_app.install_failed"));
      setEstados(i.id, { k: "libre" });
      void cargar();
    }
  }

  /** Drive: su CLI (rclone) se descarga si falta y luego se aprueba en el navegador. */
  async function conectarDrive(i: Integracion) {
    if (oficial()) return conectarDriveDeEscritorio(i);
    const d = drive();
    if (d && !d.supported) return void setErrores(i.id, t("onboarding.tools.unsupported"));
    try {
      if (!d?.installed) {
        setEstados(i.id, { k: "descargando", hecho: 0, total: null });
        void getInstallSize("google-drive")
          .then((b) => {
            const e = estados[i.id];
            if (e?.k === "descargando" && !e.total) setEstados(i.id, { ...e, total: b });
          })
          .catch(() => {});
        const terminado = new Promise<AvanceDeDrive>((resolve) => (finDeDescarga = resolve));
        await installGoogleDrive();
        const a = await terminado;
        finDeDescarga = null;
        if (a.kind === "cancelled") return void setEstados(i.id, { k: "libre" });
        if (a.kind === "error") throw a.failure ?? new Error(t("onboarding.tools.drive_install_failed"));
        if (cerrada || estados[i.id]?.k === "libre") return;
      }
      setEstados(i.id, { k: "conectando" });
      const { url } = await startGoogleDriveLogin();
      openExternal(url).catch(() => {});
      const fresco = await finishGoogleDriveLogin();
      if (cerrada) return;
      setDrive(fresco);
      setEstados(i.id, guardado(i));
    } catch (e) {
      finDeDescarga = null;
      if (cerrada || estados[i.id]?.k === "libre") return;
      setErrores(i.id, explicar(e));
      setEstados(i.id, { k: "libre" });
      void cargar();
    }
    props.onCambio(integraciones().filter((x) => estados[x.id]?.k === "conectada").length);
  }

  /** Mientras Zotero arranca, la tarjeta pasa sola al siguiente paso cuando contesta. */
  function vigilarZotero(i: Integracion, intento: number) {
    clearTimeout(vigiaDeZotero);
    vigiaDeZotero = setTimeout(async () => {
      const z = await getZoteroStatus().catch(() => null);
      if (cerrada || intento !== intentoDeZotero || estados[i.id]?.k !== "abriendo") return;
      if (z?.running) return segunZotero(i, z);
      vigilarZotero(i, intento);
    }, CADA_CUANTO_SESION);
  }

  /** Zotero se instala solo si falta y se abre; después solo queda permitir su API local. */
  async function conectarZotero(i: Integracion) {
    const intento = ++intentoDeZotero;
    const vigente = () => !cerrada && intento === intentoDeZotero;
    try {
      let z = await getZoteroStatus();
      if (!vigente()) return;
      if (!z.installed) {
        setEstados(i.id, { k: "descargando", hecho: 0, total: z.installer_bytes });
        const terminada = new Promise<InstalacionDeDrive>((resolve) => (finDeZotero = resolve));
        await installZotero();
        const a = await terminada;
        finDeZotero = null;
        if (!vigente() || a.kind === "cancelled") return;
        if (a.kind === "error") throw new Error(falloDeInstalacion(a.failure, "settings.references.zotero.error_install"));
        z = await getZoteroStatus();
        if (!vigente()) return;
      }
      if (z.running) return segunZotero(i, z);
      await openZotero();
      if (!vigente()) return;
      setEstados(i.id, { k: "abriendo" });
      vigilarZotero(i, intento);
    } catch (e) {
      finDeZotero = null;
      if (!vigente()) return;
      setErrores(i.id, explicar(e) || t("settings.references.zotero.error_install"));
      setEstados(i.id, { k: "libre" });
    }
  }

  async function conectar(i: Integracion) {
    setErrores(i.id, null);
    setMotivos(i.id, null);
    if (i.id === "zotero") return conectarZotero(i);
    if (i.via === "drive") return conectarDrive(i);
    if (i.via === "proveedor") {
      const p = proveedor(i.id);
      if (!p) return void setErrores(i.id, t("onboarding.tools.unavailable"));
      if (!p.browser_login) return abrirFormulario(i, null);
      setEstados(i.id, { k: "conectando" });
      try {
        const espera = await startBrowserLogin(i.id, await scope);
        if (cerrada) return;
        setEstados(i.id, { k: "conectando", codigo: espera.code });
        openExternal(espera.url).catch(() => {});
      } catch (e) {
        if (estados[i.id]?.k !== "conectando") return;
        return abrirFormulario(i, explicar(e));
      }
      try {
        const fresco = await finishBrowserLogin(i.id, await scope);
        if (fresco.setup_url) openExternal(fresco.setup_url).catch(() => {});
        // Pasa directo a «Conectada» con lo que devolvió el login, sin mostrar «Conectar» mientras recarga.
        setProveedores((ps) => ps.map((x) => (x.id === fresco.id ? fresco : x)));
        // Los agentes usan gh con esta conexión; en Ajustes se instala a mano, aquí se deja listo.
        if (i.id === "github") installGh().catch(() => {});
      } catch (e) {
        if (estados[i.id]?.k !== "conectando") return;
        setErrores(i.id, explicar(e));
      }
      setEstados(i.id, guardado(i));
      return void cargar();
    }
    const c = conocido(i);
    if (!c) return void setErrores(i.id, t("onboarding.tools.unavailable"));
    esperandoMcp = i.id;
    setEstados(i.id, { k: "conectando" });
    try {
      await connectKnownMcp(i.id);
      // Lo autoriza el motor para todos los agentes; `provider` solo dice quién lo pidió.
      if (c.pide_sesion) {
        await mcpLogin(agenteDeSesion()?.id ?? "", i.id);
        return;
      }
    } catch (e) {
      if (esperandoMcp !== i.id) return;
      esperandoMcp = null;
      setErrores(i.id, explicar(e));
      setEstados(i.id, { k: "libre" });
      return;
    }
    esperandoMcp = null;
    await cargar();
    setEstados(i.id, guardado(i));
  }

  // La tarjeta vuelve al instante; el motor termina de cortar por detrás.
  async function cancelar(i: Integracion) {
    setErrores(i.id, null);
    const e = estados[i.id]?.k;
    const conToken = Boolean(borradores[i.id]?.token);
    setBorradores(i.id, SIN_BORRADOR);
    setMotivos(i.id, null);
    if (!cerrada) setEstados(i.id, { k: "libre" });
    if (i.id === "zotero") {
      intentoDeZotero++;
      finDeZotero = null;
      clearTimeout(vigiaDeZotero);
      if (e === "descargando") void cancelInstall("zotero").catch(() => {});
    } else if (i.via === "drive" && oficial()) {
      intentoDeDrive++;
      finDeInstalacion = null;
      clearTimeout(vigiaDeSesion);
      if (e === "descargando") void cancelInstall("google-drive-desktop").catch(() => {});
    } else if (i.via === "drive") {
      if (e === "descargando") void cancelInstall("google-drive").catch(() => {});
      if (e === "conectando") void cancelGoogleDriveLogin().catch(() => {});
    } else if (i.via === "proveedor" && e === "conectando" && !conToken) {
      void cancelBrowserLogin(i.id, await scope).catch(() => {});
    } else if (i.via !== "proveedor" && esperandoMcp === i.id) {
      esperandoMcp = null;
      void disconnectKnownMcp(i.id).catch(() => {});
    }
  }

  return { cargar, conectar, cancelar };
}

export type Conexiones = ReturnType<typeof createConexiones>;
