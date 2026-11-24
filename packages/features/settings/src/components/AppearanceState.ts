import { open } from "@tauri-apps/plugin-dialog";
import { createResource, createSignal, onCleanup, onMount } from "solid-js";
import { listMachineAgents, setAgentAvatar } from "../queries/engine-agents";
import { previewFile } from "../queries/engine-workspaces";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { elegirArchivoDeImagen } from "../../../../host/src/pick-image";
import type { AgentProfile, CatalogoDeAgentes } from "../../../../ui/src/lib/model";
import { type FondoDeChat } from "../../../../ui/src/lib/chat-background";
import { elegirFondoDeChat, fondoDeChat, fondoPropio, imagenDelWorkspace, veloDeFondo, veloDePaneles, veloDePestanas } from "../../../../../apps/desktop/src/lib/chat-background-store";
import type { Preview } from "../../../../ui/src/lib/preview";
import { apariencia, darkStyle, lightStyle, type Apariencia, type DarkStyle, type LightStyle } from "../../../../ui/src/lib/theme";
import { prosaDe } from "../../../../ui/src/Failure";
import { createWorkspaces } from "../queries/workspaces-store";
import { type Fila, filaDe, proyectoDe, IMAGES, motor } from "./AppearanceOptions";
import type Appearance from "./AppearanceView";

export function createApariencia(props: Parameters<typeof Appearance>[0]) {
  const { machineOf } = props.maquinas;
  const { AstroAvatar, displayName, notifyProfiles } = props.piezas;
  const [tema, setTema] = createSignal<Apariencia>(apariencia());
  const [estilo, setEstilo] = createSignal<DarkStyle>(darkStyle());
  const [estiloClaro, setEstiloClaro] = createSignal<LightStyle>(lightStyle());
  const [fondo, setFondo] = createSignal<FondoDeChat>(fondoDeChat());
  const [propia, setPropia] = createSignal<string | null>(fondoPropio());
  /** El workspace tiene imagen propia: la copia subida aquí o la que devolvió su motor. */
  const hayPropia = () => !!propia() || !!imagenDelWorkspace();
  const [velo, setVelo] = createSignal(veloDeFondo());
  const visibilidad = () => Math.round((1 - velo()) * 100);
  const [veloPestanas, setVeloPestanas] = createSignal(veloDePestanas());
  const [veloPaneles, setVeloPaneles] = createSignal(veloDePaneles());
  const espacios = createWorkspaces();
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
    const propias = catalogo.own.map((a) =>
      filaDe(
        a.agent.name,
        a.profile,
        proyectoDe(props.proyecto, a.agent.own_scope, a.folders),
        `own:${a.agent.name}`,
      ),
    );
    const delRepositorio = catalogo.repository.map((r) =>
      filaDe(r.agent.name, r.profile, r.folders[0] ?? null, `repo:${r.agent.origin}`),
    );
    return [...propias, ...delRepositorio].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }

  onMount(() => {
    void recargar();
    const deFuera = () => void recargar();
    window.addEventListener("harness:profiles", deFuera);
    window.addEventListener("harness:encargados", deFuera);
    window.addEventListener("harness:workspace", deFuera);
    onCleanup(() => {
      lectura++;
      window.removeEventListener("harness:profiles", deFuera);
      window.removeEventListener("harness:encargados", deFuera);
      window.removeEventListener("harness:workspace", deFuera);
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
      await setAgentAvatar<AgentProfile>({
        project: fila.project,
        name: fila.name,
        source,
      });
      notifyProfiles();
    } catch (error) {
      setFallo(prosaDe(error));
    } finally {
      setOcupada(null);
    }
  }

  async function elegirImagen(fila: Fila) {
    const chosen = await open({
      multiple: false,
      directory: false,
      filters: [{ name: t("settings.appearance.avatar.images"), extensions: IMAGES }],
    });
    if (typeof chosen !== "string") return;
    await ponerAvatar(fila, chosen);
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
      setFondo(await (await motor()).elegirFondoPropio(file));
      setPropia(fondoPropio());
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
    setFondo(elegirFondoDeChat(id));
    void motor().then((m) => m.guardarFondo());
  }
  return {
    espacios, tema, setTema, estilo, setEstilo, estiloClaro, setEstiloClaro, hayPropia, elegirImagenPropia,
    setFondo, setPropia, fondo, pulsarFondo, vistaPropia, velo, visibilidad, setVelo, veloPestanas,
    setVeloPestanas, veloPaneles, setVeloPaneles, backgroundFailure, cargado, filas, AstroAvatar,
    displayName, ocupada, ponerAvatar, elegirImagen, fallo,
  };
}
