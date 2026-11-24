import { open } from "@tauri-apps/plugin-dialog";
import { createResource, createSignal, onCleanup, onMount } from "solid-js";
import { listMachineAgents, savePastedImage, setAgentAvatar } from "../queries/engine-agents";
import { previewFile } from "../queries/engine-workspaces";
import { t } from "../../../../ui/src/lib/i18n";
import { mimeOfAttachment } from "../../../../ui/src/lib/attachment-mime.ts";
import { elegirArchivoDeImagen } from "../../../../host/src/pick-image";
import { capabilities } from "../../../../host/src/platform";
import type { AgentProfile, CatalogoDeAgentes } from "../../../../ui/src/lib/model";
import { type FondoDeChat } from "../../../../ui/src/lib/chat-background";
import {
  elegirFondoDeChat,
  fondoDeChat,
  fondoPropio,
  imagenDelWorkspace,
  veloDeFondo,
  veloDePaneles,
  veloDePestanas,
  workspaceAbierto,
} from "../../../../ui/src/lib/chat-background-store";
import type { Preview } from "../../../../ui/src/lib/preview";
import { blobToDataUrl } from "../../../../ui/src/lib/shrink-image";
import { apariencia, darkStyle, lightStyle } from "../../../../ui/src/lib/theme";
import { prosaDe } from "../../../../ui/src/Failure";
import { type Fila, filaDe, proyectoDe, IMAGES, motor } from "./AppearanceOptions";
import type Appearance from "./AppearanceView";

const AVATAR_MAX_BYTES = 4 * 1024 * 1024;
const AVATAR_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function createApariencia(props: Parameters<typeof Appearance>[0]) {
  const { machineOf } = props.maquinas;
  const { AstroAvatar, displayName, notifyProfiles } = props.piezas;
  const tema = apariencia;
  const estilo = darkStyle;
  const estiloClaro = lightStyle;
  const fondo = fondoDeChat;
  const propia = fondoPropio;
  /** El workspace tiene imagen propia: la copia subida aquí o la que devolvió su motor. */
  const hayPropia = () => !!propia() || !!imagenDelWorkspace();
  const velo = veloDeFondo;
  const visibilidad = () => Math.round((1 - velo()) * 100);
  const veloPestanas = veloDePestanas;
  const veloPaneles = veloDePaneles;
  const [filas, setFilas] = createSignal<Fila[]>([]);
  const [cargado, setCargado] = createSignal(false);
  const [fallo, setFallo] = createSignal<string | null>(null);
  const [backgroundFailure, setBackgroundFailure] = createSignal<string | null>(null);
  const [ocupada, setOcupada] = createSignal<string | null>(null);
  let lectura = 0;

  async function recargar() {
    const esta = ++lectura;
    try {
      const catalogo = await listMachineAgents<CatalogoDeAgentes>();
      if (esta !== lectura) return;
      setFilas(filasDe(catalogo));
      setFallo(null);
    } catch (error) {
      if (esta === lectura) setFallo(prosaDe(error));
    } finally {
      if (esta === lectura) setCargado(true);
    }
  }

  function filasDe(catalogo: CatalogoDeAgentes): Fila[] {
    const propias = (catalogo.own ?? []).map((a) =>
      filaDe(
        a.agent.name,
        a.profile,
        proyectoDe(props.proyecto, a.agent.own_scope, a.folders ?? []),
        `own:${a.agent.name}`,
      ),
    );
    const delRepositorio = (catalogo.repository ?? []).map((r) =>
      filaDe(r.agent.name, r.profile, (r.folders ?? [])[0] ?? null, `repo:${r.agent.origin}`),
    );
    return [...propias, ...delRepositorio].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }

  function cargarFondo(forzar = false) {
    const workspace = props.workspace ?? null;
    if (!workspace) return;
    if (!forzar && workspaceAbierto() === workspace) return;
    void motor().then((m) => m.cargarFondoDelWorkspace(workspace));
  }

  onMount(() => {
    void recargar();
    cargarFondo();
    const deFuera = () => void recargar();
    const alDespertar = () => {
      void recargar();
      cargarFondo(true);
    };
    window.addEventListener("harness:profiles", deFuera);
    window.addEventListener("harness:encargados", deFuera);
    window.addEventListener("harness:workspace", deFuera);
    window.addEventListener("harness:machine-slices", alDespertar);
    onCleanup(() => {
      lectura++;
      window.removeEventListener("harness:profiles", deFuera);
      window.removeEventListener("harness:encargados", deFuera);
      window.removeEventListener("harness:workspace", deFuera);
      window.removeEventListener("harness:machine-slices", alDespertar);
    });
  });

  async function ponerAvatar(fila: Fila, source: string | null) {
    if (!fila.project) {
      setFallo(t("settings.appearance.avatar.no_folder"));
      return;
    }
    setOcupada(fila.id);
    setFallo(null);
    try {
      await setAgentAvatar<AgentProfile>(
        {
          project: fila.project,
          name: fila.name,
          source,
        },
        machineOf(fila.project),
      );
      notifyProfiles();
    } catch (error) {
      setFallo(prosaDe(error));
    } finally {
      setOcupada(null);
    }
  }

  async function elegirImagen(fila: Fila) {
    if (!fila.project) {
      setFallo(t("settings.appearance.avatar.no_folder"));
      return;
    }
    if (capabilities().nativeWindow) {
      const chosen = await open({
        multiple: false,
        directory: false,
        filters: [{ name: t("settings.appearance.avatar.images"), extensions: IMAGES }],
      });
      if (typeof chosen !== "string") return;
      await ponerAvatar(fila, chosen);
      return;
    }
    const file = await elegirArchivoDeImagen(IMAGES);
    if (!file) return;
    const mime = mimeOfAttachment(file.type, file.name);
    if (!mime || !AVATAR_MIMES.has(mime)) {
      setFallo(t("settings.appearance.avatar.bad_type"));
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setFallo(t("settings.appearance.avatar.too_big"));
      return;
    }
    setOcupada(fila.id);
    setFallo(null);
    try {
      const dataUrl = await blobToDataUrl(file, mime);
      const datos = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const destino = machineOf(fila.project);
      const source = await savePastedImage<string>({ mime, datos }, destino);
      await setAgentAvatar<AgentProfile>(
        {
          project: fila.project,
          name: fila.name,
          source,
        },
        destino,
      );
      notifyProfiles();
    } catch (error) {
      setFallo(prosaDe(error));
    } finally {
      setOcupada(null);
    }
  }

  /* La miniatura lee el archivo por el servicio: la ventana no pinta
     `file://` (`AGENTS.md` § el guarda `csp`). */
  const [vistaPropia] = createResource(propia, async (ruta) => {
    if (!ruta) return null;
    try {
      return (await previewFile<Preview>({ path: ruta, rel: ruta }, machineOf(ruta))).data_url;
    } catch {
      return null;
    }
  });

  async function elegirImagenPropia() {
    const file = await elegirArchivoDeImagen(IMAGES);
    if (!file) return;
    setBackgroundFailure(null);
    try {
      await (await motor()).elegirFondoPropio(file);
    } catch (error) {
      // `ShrinkError` de `shrink-image.ts`, que llega en el módulo diferido.
      const code = error instanceof Error && error.name === "ShrinkError" ? (error as Error & { code?: string }).code : null;
      setBackgroundFailure(
        code === "too_big"
          ? t("settings.appearance.background.too_big")
          : code === "unreadable"
            ? t("settings.appearance.background.bad_type")
            : prosaDe(error),
      );
    }
  }

  function pulsarFondo(id: FondoDeChat) {
    if (id === "propia" && !hayPropia()) {
      void elegirImagenPropia();
      return;
    }
    elegirFondoDeChat(id);
    void motor().then((m) => m.guardarFondo());
  }
  return {
    tema, estilo, estiloClaro, hayPropia, elegirImagenPropia, fondo, pulsarFondo, vistaPropia, velo,
    visibilidad, veloPestanas, veloPaneles, backgroundFailure, cargado, filas, AstroAvatar,
    displayName, ocupada, ponerAvatar, elegirImagen, fallo,
  };
}
