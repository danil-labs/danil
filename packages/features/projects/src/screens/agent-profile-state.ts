import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { AgentProfile as Profile, HandlerDefinition } from "../../../../ui/src/lib/model";
import { type OpcionDeModelo, opcionesDeModelos } from "../../../../ui/src/lib/models";
import { prosaDe } from "../../../../ui/src/Failure";
import { DEFAULT_PROFILE, notifyProfiles } from "../queries/profiles";
import { IMAGES, type AgentProfileProps } from "./agent-profile-model";

export function createAgentProfile(props: AgentProfileProps) {
  const [name, setName] = createSignal(props.profile.display_name ?? "");
  const [description, setDescription] = createSignal(props.agent.description);
  const [instructions, setInstructions] = createSignal(props.agent.instructions);
  const [failure, setFailure] = createSignal<string | null>(null);
  const profile = () => props.profile ?? DEFAULT_PROFILE;
  const body = createMemo(() => profile().body ?? null);
  const visibility = () => Math.round((1 - profile().veil) * 100);

  const [agentChoice, setAgentChoice] = createSignal(props.profile.provider);
  const [modelChoice, setModelChoice] = createSignal(props.profile.model);
  // `terminus handler update` cambia el perfil con esta pantalla abierta. Solo
  // el campo cuyo valor cambió: cualquier recarga trae un objeto nuevo, y
  // pisar el nombre a medio escribir lo perdería.
  createEffect(
    on(
      () => props.profile,
      (p, prev) => {
        if (p.display_name !== prev?.display_name) setName(p.display_name ?? "");
        if (p.provider !== prev?.provider || p.model !== prev?.model) {
          setAgentChoice(p.provider);
          setModelChoice(p.model);
        }
      },
      { defer: true },
    ),
  );
  // Mismo cuidado que el nombre, pero con la declaración: `avisar()` trae un
  // `agent` nuevo tras guardar, y no debe pisar lo que se está tecleando.
  createEffect(
    on(
      () => props.agent,
      (e, prev) => {
        if (e.description !== prev?.description) setDescription(e.description);
        if (e.instructions !== prev?.instructions) setInstructions(e.instructions);
      },
      { defer: true },
    ),
  );
  const opciones = createMemo(() => opcionesDeModelos(props.superficies, props.catalogos));
  // Cuál superficie pintar seleccionada: la primera del agente elegido que
  // de verdad ofrezca el modelo, o la primera del agente si ninguna lo hace
  // — esta pantalla no lanza nada, solo declara una preferencia.
  const superficieElegida = createMemo(() => {
    const agent = agentChoice();
    if (!agent) return "";
    const suyas = props.superficies.filter((s) => s.provider === agent);
    const modelo = modelChoice();
    const conModelo = modelo
      ? opciones().find((o) => o.agent === agent && o.model.id === modelo)?.superficie
      : undefined;
    return conModelo ?? suyas[0]?.id ?? "";
  });

  async function guardarModelo(agent: string | null, model: string | null) {
    setFailure(null);
    try {
      await invoke<Profile>("set_agent_model", {
        project: props.project,
        name: props.agent.name,
        provider: agent,
        model,
        effort: null,
      });
      notifyProfiles();
      props.onModelChosen?.(agent, model);
    } catch (error) {
      setFailure(prosaDe(error));
    }
  }

  function elegirModeloDelAgente(opcion: OpcionDeModelo) {
    setAgentChoice(opcion.agent);
    setModelChoice(opcion.model.id);
    void guardarModelo(opcion.agent, opcion.model.id);
  }

  function olvidarEleccion() {
    setAgentChoice(null);
    setModelChoice(null);
    void guardarModelo(null, null);
  }

  async function save(change: Partial<Profile>) {
    setFailure(null);
    const base = profile();
    try {
      await invoke<Profile>("save_agent_profile", {
        project: props.project,
        name: props.agent.name,
        displayName:
          change.display_name !== undefined ? change.display_name : base.display_name,
        body: change.body !== undefined ? change.body : base.body,
        veil: change.veil !== undefined ? change.veil : base.veil,
      });
      notifyProfiles();
    } catch (error) {
      setFailure(prosaDe(error));
    }
  }

  // Solo llega aquí un agente propio: la pantalla no ofrece este campo a uno
  // del repositorio, y el backend lo rechazaría igual (`edit_own`).
  async function saveDeclaration(change: { description?: string; instructions?: string }) {
    setFailure(null);
    try {
      await invoke<HandlerDefinition>("save_agent_declaration", {
        project: props.project,
        name: props.agent.name,
        description: change.description ?? description(),
        instructions: change.instructions ?? instructions(),
      });
      avisar();
    } catch (error) {
      setFailure(prosaDe(error));
    }
  }

  const [confirmando, setConfirmando] = createSignal(false);
  const [borrando, setBorrando] = createSignal(false);

  async function borrar() {
    setFailure(null);
    setBorrando(true);
    try {
      await invoke("delete_agent", {
        project: props.project,
        name: props.agent.name,
      });
      avisar();
      props.onDeleted?.();
      props.onClose();
    } catch (error) {
      setFailure(prosaDe(error));
      setConfirmando(false);
    } finally {
      setBorrando(false);
    }
  }

  async function ocultar(hidden: boolean) {
    setFailure(null);
    try {
      await invoke<Profile>("set_agent_hidden", {
        project: props.project,
        name: props.agent.name,
        hidden,
      });
      avisar();
      // Ocultarlo desde su propio perfil deja el perfil de alguien que ya no
      // está en la lista: se vuelve a la conversación.
      if (hidden) props.onClose();
    } catch (error) {
      setFailure(prosaDe(error));
    }
  }

  // Las dos listas de encargados —el riel y la del proyecto— leen por su
  // cuenta: sin el aviso, el que se fue sigue pintado hasta cambiar de
  // proyecto.
  function avisar() {
    notifyProfiles();
    window.dispatchEvent(new CustomEvent("harness:encargados"));
  }

  async function chooseBackground() {
    const chosen = await open({
      multiple: false,
      directory: false,
      filters: [{ name: t("projects.agents.profile_images"), extensions: IMAGES }],
    });
    if (typeof chosen !== "string") return;
    await setBackground(chosen);
  }

  async function setAvatar(source: string | null): Promise<boolean> {
    setFailure(null);
    try {
      await invoke<Profile>("set_agent_avatar", {
        project: props.project,
        name: props.agent.name,
        source,
      });
      notifyProfiles();
      return true;
    } catch (error) {
      setFailure(prosaDe(error));
      return false;
    }
  }

  async function elegirCara(option: string | null) {
    if (profile().avatar && !(await setAvatar(null))) return;
    await save({ body: option });
  }

  async function setBackground(source: string | null) {
    setFailure(null);
    try {
      await invoke<Profile>("set_agent_background", {
        project: props.project,
        name: props.agent.name,
        source,
      });
      notifyProfiles();
    } catch (error) {
      setFailure(prosaDe(error));
    }
  }

  // Escape cierra, salvo escribiendo el nombre: ahí la tecla es del campo y
  // cerrar se llevaría por delante lo tecleado sin guardarlo.
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
    props.onClose();
  }
  window.addEventListener("keydown", onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", onKeyDown));

  return { name, setName, save, description, setDescription, saveDeclaration, opciones, superficieElegida, modelChoice, elegirModeloDelAgente, agentChoice, olvidarEleccion, body, profile, elegirCara, setAvatar, chooseBackground, setBackground, visibility, instructions, setInstructions, ocultar, setConfirmando, confirmando, borrando, borrar, failure };
}
