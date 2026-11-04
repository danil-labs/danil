import { capabilities } from "../../lib/platform";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import EyeOff from "lucide-solid/icons/eye-off";
import FolderOpen from "lucide-solid/icons/folder-open";
import ImagePlus from "lucide-solid/icons/image-plus";
import Trash2 from "lucide-solid/icons/trash-2";
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js";
import SelectorDeModelo from "../chat/ModelPicker";
import { t } from "../../lib/i18n";
import type { AgentProfile as Profile, HandlerDefinition, HandlerStatus } from "../../lib/model";
import { type CatalogosDeModelos, type OpcionDeModelo, opcionesDeModelos } from "../../lib/models";
import type { Superficie } from "../../lib/surfaces";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { prosaDe } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { Textarea } from "../../ui/Textarea";
import { AstroAvatar } from "./AstroAvatar";
import { BodyPicker } from "./BodyPicker";
import { DEFAULT_PROFILE, notifyProfiles } from "./profiles";
import { TelegramSection } from "./TelegramSection";
import type { HandlerTarget } from "../settings/HandlerPolicy";
import { LazyPart, retryableLazy } from "../../ui/LazyPart";
const HandlerPolicy = retryableLazy(() => import("../settings/HandlerPolicy"));

/** Las extensiones que el webview pinta como `data:` URI (`preview::data_url`). */
const IMAGES = ["png", "jpg", "jpeg", "webp", "gif"];

const SECTION = "grid gap-2";
const LABEL = "text-xs font-semibold text-neutral-500";

/**
 * El perfil de un agente, dentro de la pestaña de su conversación.
 *
 * El nombre que se edita aquí es el que se lee; el declarado no se toca, que es
 * la clave de sus tareas y de su memoria (`docs/custom-agents.md` § Alcance).
 * Las instrucciones de uno del repositorio solo se muestran (`edit_own`).
 */
export default function AgentProfile(props: {
  project: string;
  agent: HandlerDefinition;
  profile: Profile;
  status: HandlerStatus;
  /** La imagen de fondo ya leída, o `null` mientras no haya ninguna. */
  background: string | null;
  /** Lo que se puede elegir para trabajar, para ofrecer aquí el mismo menú
   *  que la caja de escritura. */
  superficies: Superficie[];
  catalogos: CatalogosDeModelos;
  /** Con qué CLI corrió su chat la última vez. `null` si nunca arrancó:
   *  ahí no hay hilo que perder al elegir un proveedor distinto. */
  currentAgent: string | null;
  /** Si su chat es el que está abierto en pantalla ahora mismo: solo
   *  entonces el cambio aplica de inmediato al turno siguiente. */
  onModelChosen?: (agent: string | null, model: string | null) => void;
  /** Que quien lista los encargados relea: el borrado no deja fila que mirar. */
  onDeleted?: () => void;
  handlerPolicy?: HandlerTarget;
  onClose: () => void;
}) {
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

  return (
    <div class="flex min-h-0 flex-1 flex-col bg-surface">
      <header class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <button
          class="grid size-7 place-items-center rounded-sm border-0 bg-transparent text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={t("projects.agents.profile_back")}
          title={`${t("projects.agents.profile_back")} (Esc)`}
          onClick={() => props.onClose()}
        >
          <ArrowLeft size={16} />
        </button>
        <span class="text-ui font-semibold">{t("projects.agents.profile_title")}</span>
      </header>

      <div class="min-h-0 flex-1 overflow-auto">
        <div class="mx-auto grid w-full max-w-[560px] gap-7 px-6 py-8">
          <div class="grid justify-items-center gap-3">
            <AstroAvatar
              name={props.agent.name}
              status={props.status}
              body={body()}
              avatar={profile().avatar}
              size={112}
            />
            <label class="grid w-full max-w-[20rem] justify-items-center gap-1">
              <span class="sr-only">{t("projects.agents.profile_name")}</span>
              <Input
                class="text-center text-base font-semibold"
                value={name()}
                placeholder={props.agent.name}
                onInput={(e) => setName(e.currentTarget.value)}
                onChange={() => void save({ display_name: name().trim() || null })}
              />
            </label>
            <span class="font-mono text-caption text-neutral-500">
              {props.agent.name}
            </span>
            <Show
              when={props.agent.own}
              fallback={
                <p class="m-0 text-center text-ui text-neutral-700">
                  {props.agent.description}
                </p>
              }
            >
              <label class="grid w-full max-w-[20rem] justify-items-center gap-1">
                <span class="sr-only">{t("projects.agents.new_description")}</span>
                <Input
                  class="text-center text-ui"
                  value={description()}
                  placeholder={t("projects.agents.new_description_hint")}
                  onInput={(e) => setDescription(e.currentTarget.value)}
                  onChange={() => void saveDeclaration({ description: description() })}
                />
              </label>
            </Show>
          </div>

          <section class={SECTION}>
            <span class={LABEL}>{t("projects.agents.profile_model")}</span>
            <div class="flex items-center gap-2">
              <SelectorDeModelo
                models={opciones()}
                superficie={superficieElegida()}
                model={modelChoice() ?? ""}
                onChange={elegirModeloDelAgente}
              />
              <Show when={agentChoice() || modelChoice()}>
                <Button size="sm" variant="ghost" onClick={olvidarEleccion}>
                  {t("projects.agents.profile_model_reset")}
                </Button>
              </Show>
            </div>
            <Show when={!agentChoice() && !modelChoice()}>
              <span class="text-xs text-neutral-500">
                {t("projects.agents.profile_model_default")}
              </span>
            </Show>
            <Show
              when={
                agentChoice() && props.currentAgent && agentChoice() !== props.currentAgent
              }
            >
              <p class="m-0 text-xs text-warning-strong">
                {t("projects.agents.profile_model_handover")}
              </p>
            </Show>
          </section>

          <section class={SECTION}>
            <span class={LABEL}>{t("projects.agents.profile_face")}</span>
            <BodyPicker
              name={props.agent.name}
              value={profile().avatar ? "" : body()}
              onChange={(option) => void elegirCara(option)}
            />
            <Show when={profile().avatar}>
              <Button size="sm" variant="ghost" onClick={() => void setAvatar(null)}>
                <Trash2 size={14} />
                {t("projects.agents.profile_avatar_clear")}
              </Button>
            </Show>
          </section>

          <section class={SECTION}>
            <span class={LABEL}>{t("projects.agents.profile_background")}</span>
            <div
              class="relative grid h-28 place-items-center overflow-hidden rounded-md border border-border bg-surface-muted bg-cover bg-center"
              style={props.background ? { "background-image": `url("${props.background}")` } : undefined}
            >
              <Show when={props.background}>
                <div
                  class="absolute inset-0 bg-surface"
                  style={{ opacity: String(profile().veil) }}
                  aria-hidden="true"
                />
              </Show>
              <span class="relative text-ui text-neutral-500">
                {props.background
                  ? t("projects.agents.profile_background_sample")
                  : t("projects.agents.profile_background_none")}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => void chooseBackground()}>
                <ImagePlus size={14} />
                {props.background
                  ? t("projects.agents.profile_background_change")
                  : t("projects.agents.profile_background_pick")}
              </Button>
              <Show when={props.background}>
                <Button size="sm" variant="ghost" onClick={() => void setBackground(null)}>
                  <Trash2 size={14} />
                  {t("projects.agents.profile_background_clear")}
                </Button>
              </Show>
            </div>
            <Show when={props.background}>
              <label class="grid gap-1">
                <span class="text-xs text-neutral-500">
                  {t("projects.agents.profile_visibility", { percent: visibility() })}
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  class="w-full accent-primary"
                  value={visibility()}
                  onInput={(e) => void save({ veil: 1 - Number(e.currentTarget.value) / 100 })}
                />
              </label>
            </Show>
          </section>

          <section class={SECTION}>
            <span class={LABEL}>{t("projects.agents.profile_prompt")}</span>
            <Show
              when={props.agent.own}
              fallback={
                <>
                  <pre class="m-0 max-h-80 overflow-auto rounded-md border border-border bg-surface-muted p-3 font-mono text-caption leading-relaxed whitespace-pre-wrap text-neutral-700">
                    {props.agent.instructions}
                  </pre>
                  <span class="text-caption text-neutral-500">
                    {props.agent.managed
                      ? t("projects.agents.profile_prompt_harness")
                      : t("projects.agents.profile_prompt_where")}
                  </span>
                </>
              }
            >
              <Textarea
                class="max-h-80 font-mono text-caption leading-relaxed"
                rows={8}
                value={instructions()}
                placeholder={t("projects.agents.new_instructions_hint")}
                onInput={(e) => setInstructions(e.currentTarget.value)}
                onChange={() => void saveDeclaration({ instructions: instructions() })}
              />
            </Show>
            <span class="font-mono text-2xs break-all text-neutral-500">
              {props.agent.origin}
            </span>
            {/* Solo con carpeta suya: la declaración suelta comparte carpeta
                con los demás agentes, y abrirla entregaría su material. */}
            <Show when={props.agent.folder}>
              {(folder) => (
                <div class="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void invoke("open_external", { target: folder() })}
                  >
                    <FolderOpen size={14} />
                    {t("projects.agents.profile_folder")}
                  </Button>
                  <span class="self-center text-caption text-neutral-500">
                    {t("projects.agents.profile_folder_what")}
                  </span>
                </div>
              )}
            </Show>
          </section>

          {capabilities().inbox?.agentSettings(props.agent.name)}
          <Show when={props.handlerPolicy}>{target => <LazyPart><HandlerPolicy name={props.agent.name} target={target()} /></LazyPart>}</Show>
          <TelegramSection project={props.project} name={props.agent.name} />

          <section class={SECTION}>
            <Show
              when={props.agent.own}
              fallback={
                <>
                  <span class="text-ui text-neutral-700">
                    {profile().hidden
                      ? t("projects.agents.profile_hidden_what")
                      : t("projects.agents.profile_hide_what")}
                  </span>
                  <div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void ocultar(!profile().hidden)}
                    >
                      <EyeOff size={14} />
                      {profile().hidden
                        ? t("projects.agents.profile_show")
                        : t("projects.agents.profile_hide")}
                    </Button>
                  </div>
                </>
              }
            >
              <div>
                <Button size="sm" variant="ghost" onClick={() => setConfirmando(true)}>
                  <Trash2 size={14} />
                  {t("projects.agents.profile_delete")}
                </Button>
              </div>
            </Show>
          </section>

          <Dialog
            open={confirmando()}
            onOpenChange={(open) => {
              if (!open && !borrando()) setConfirmando(false);
            }}
          >
            <DialogContent>
              <DialogTitle class="text-sm font-semibold">
                {t("projects.agents.profile_delete_title", {
                  name: props.profile.display_name || props.agent.name,
                })}
              </DialogTitle>
              <Dialog.Description class="my-4 text-sm leading-6 text-neutral-500">
                {t("projects.agents.profile_delete_what")}
              </Dialog.Description>
              <div class="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={borrando()}
                  onClick={() => setConfirmando(false)}
                >
                  {t("projects.agents.profile_delete_cancel")}
                </Button>
                <Button variant="danger" disabled={borrando()} onClick={() => void borrar()}>
                  <Trash2 size={14} />
                  {borrando()
                    ? t("projects.agents.profile_deleting")
                    : t("projects.agents.profile_delete_confirm")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Show when={failure()}>
            {(text) => <p class="m-0 text-xs text-error-strong">{text()}</p>}
          </Show>
        </div>
      </div>
    </div>
  );
}
