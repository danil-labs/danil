import { createMemo, createSignal, For, Show } from "solid-js";
import { lockedBy } from "../../lib/governance";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import type { CreatedHandler, HandlerScope } from "../../lib/model";
import {
  type CatalogosDeModelos,
  effortOptions,
  effortValue,
  type OpcionDeModelo,
  opcionesDeModelos,
} from "../../lib/models";
import type { Superficie } from "../../lib/surfaces";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { prosaDe } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { Textarea } from "../../ui/Textarea";
import SelectorDeModelo from "../chat/ModelPicker";
import { GovernedNotice } from "../settings/Governed";
import { AstroAvatar, type Cuerpo } from "./AstroAvatar";
import { agentId } from "./agentId";
import { BodyPicker } from "./BodyPicker";
import { DEFAULT_PROFILE, notifyProfiles } from "./profiles";

/** Lo que la caja de escritura ofrece para trabajar, para ofrecer lo mismo. */
export type ModelChoices = { superficies: Superficie[]; catalogos: CatalogosDeModelos };

/** Un agente de espacio alcanza todas las carpetas; el alcance inicial es el proyecto. */
export default function NewAgent(props: {
  abierto: boolean;
  onAbrir: (abierto: boolean) => void;
  /** En qué proyecto se está: es donde se declara. */
  project: string;
  workspaceOnly?: boolean;
  modelos: ModelChoices;
  onCreado: () => void;
  /** Con esto se puede elegir dónde nace; `project` es la elegida al abrir.
   *  El riel no lo pasa: ahí nace en la carpeta de su fila. */
  carpetas?: { id: string; name: string }[];
  /** A dónde va el foco al cerrar. Sin disparador, Kobalte no lo devuelve. */
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [instructions, setInstructions] = createSignal("");
  const [body, setBody] = createSignal<Cuerpo | null>(null);
  // Sin elegir, sus temas arrancan con lo que traiga su chat.
  const [modelo, setModelo] = createSignal<OpcionDeModelo | null>(null);
  const [effort, setEffort] = createSignal("");
  const [carpeta, setCarpeta] = createSignal<string | null>(null);
  const destino = () => carpeta() ?? props.project;
  // Dónde nace: solo en esta carpeta (proyecto) o en todo el espacio
  // (workspace). La opción de inicio es la carpeta; el espacio se elige.
  const initialScope = props.workspaceOnly || !props.project ? "workspace" : "project";
  const [alcance, setAlcance] = createSignal<"project" | "workspace">(initialScope);
  const [guardando, setGuardando] = createSignal(false);
  const [fallo, setFallo] = createSignal<string | null>(null);
  // Se queda tras guardar: es lo último que la persona lee antes de cerrar.
  const [eclipse, setEclipse] = createSignal<CreatedHandler | null>(null);

  // Las tres, y las instrucciones también: un agente sin cuerpo es un nombre
  // sin criterio, y eso ya lo da el título de una tarea (docs/agents.md).
  const listo = () =>
    id() !== "" && description().trim() !== "" && instructions().trim() !== "";
  // La persona escribe el nombre como quiere verlo; el identificador —kebab-case,
  // que es lo que el backend y el repositorio aceptan— sale de él.
  const id = () => agentId(name());
  const opciones = createMemo(() =>
    opcionesDeModelos(props.modelos.superficies, props.modelos.catalogos),
  );
  const efforts = () => modelo()?.model.efforts ?? [];
  const defaultEffort = () => modelo()?.model.default_effort ?? null;

  function limpiar() {
    setName("");
    setDescription("");
    setInstructions("");
    setBody(null);
    setCarpeta(null);
    setAlcance(initialScope);
    setModelo(null);
    setEffort("");
    setFallo(null);
    setEclipse(null);
  }

  async function crear() {
    if (!listo() || guardando()) return;
    setGuardando(true);
    setFallo(null);
    const project = destino();
    const scope: HandlerScope =
      alcance() === "workspace" ? { kind: "workspace" } : { kind: "project", id: project };
    try {
      const creado = await invoke<CreatedHandler>("create_agent", {
        name: id(),
        description: description().trim(),
        instructions: instructions().trim(),
        scope,
      });
      // El nombre escrito y la cara viven en el perfil. Si no se guardan, el
      // agente ya existe y se le ponen desde su perfil: no es motivo para fallar.
      const displayName = name().trim();
      if (displayName !== id() || body() !== null) {
        await invoke("save_agent_profile", {
          project,
          name: id(),
          displayName: displayName !== id() ? displayName : null,
          body: body(),
          veil: DEFAULT_PROFILE.veil,
        }).catch(() => {});
        notifyProfiles();
      }
      const elegido = modelo();
      if (elegido) {
        await invoke("set_agent_model", {
          project,
          name: id(),
          provider: elegido.agent,
          model: elegido.model.id,
          effort: effort() || null,
        }).catch(() => {});
        notifyProfiles();
      }
      props.onCreado();
      // El riel lo lista aparte y no mira esta pantalla: sin el aviso, quien
      // crea su primer agente no lo ve aparecer donde va a usarlo.
      window.dispatchEvent(new CustomEvent("harness:encargados"));
      // Un nombre ya ganado por otra declaración no impide crearlo —puede ser
      // deliberado— pero cerrar sin decirlo deja a la persona creyendo que
      // tiene un agente cuando tiene un archivo que nadie va a leer.
      if (creado.eclipsado_por) {
        setEclipse(creado);
        return;
      }
      props.onAbrir(false);
      limpiar();
    } catch (error) {
      setFallo(prosaDe(error));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog
      open={props.abierto}
      onOpenChange={(abierto) => {
        props.onAbrir(abierto);
        if (!abierto) limpiar();
      }}
    >
      {/* Cabe en la ventana sin taparla: 74% o 38rem. El tope y el
          desplazamiento van en el mismo elemento; si van separados, el de
          afuera recorta y el de adentro no llega a desplazarse. */}
      <DialogContent
        class="scroll-visible max-h-[min(74vh,38rem)] w-[26rem] max-w-[92vw] overflow-y-auto overscroll-contain p-4"
        data-owns-escape
        onCloseAutoFocus={(e: Event) => props.onCloseAutoFocus?.(e)}
      >
        <DialogTitle class="m-0 text-sm font-semibold">
          {t("projects.agents.new_title")}
        </DialogTitle>
        <div class="mt-3 empty:hidden">
          <GovernedNotice section="agents" />
        </div>

        <Show
          when={eclipse()}
          fallback={
            <div class="mt-3 grid gap-3">
              <label class="grid gap-1">
                <span class="text-xs text-neutral-500">
                  {t("projects.agents.new_name")}
                </span>
                <Input
                  value={name()}
                  placeholder={t("projects.agents.new_name_hint")}
                  onInput={(e) => {
                    setName(e.currentTarget.value);
                    // Un fallo del nombre anterior deja de aplicar en cuanto
                    // se toca: dejarlo parece que sigue roto cuando ya no.
                    setFallo(null);
                  }}
                  autofocus
                />
                <Show when={id() !== "" && id() !== name().trim()}>
                  <span class="font-mono text-caption text-neutral-500">{id()}</span>
                </Show>
              </label>

              <label class="grid gap-1">
                <span class="text-xs text-neutral-500">
                  {t("projects.agents.new_scope")}
                </span>
                <Select
                  value={alcance()}
                  onChange={(e) => setAlcance(e.currentTarget.value as "project" | "workspace")}
                >
                  <Show when={!props.workspaceOnly && props.project}><option value="project">{t("projects.agents.new_scope_project")}</option></Show>
                  <option value="workspace">{t("projects.agents.new_scope_workspace")}</option>
                </Select>
              </label>

              <Show when={alcance() === "project" && props.carpetas}>
                {(carpetas) => (
                  <label class="grid gap-1">
                    <span class="text-xs text-neutral-500">
                      {t("projects.agents.new_folder")}
                    </span>
                    <Select
                      value={destino()}
                      onChange={(e) => setCarpeta(e.currentTarget.value)}
                    >
                      <For each={carpetas()}>
                        {(c) => <option value={c.id}>{c.name}</option>}
                      </For>
                    </Select>
                  </label>
                )}
              </Show>

              <div class="grid gap-1">
                <span class="text-xs text-neutral-500">{t("projects.agents.profile_face")}</span>
                <BodyPicker name={id() || "agent"} value={body()} onChange={setBody} />
              </div>

              <div class="grid gap-1">
                <span class="text-xs text-neutral-500">{t("projects.agents.profile_model")}</span>
                <div class="flex items-center gap-2">
                  <SelectorDeModelo
                    models={opciones()}
                    superficie={modelo()?.superficie ?? ""}
                    model={modelo()?.model.id ?? ""}
                    onChange={(opcion) => {
                      setModelo(opcion);
                      setEffort("");
                    }}
                  />
                  <Show when={efforts().length > 0}>
                    <Select
                      variant="ghost"
                      class="min-h-8 w-auto max-w-[9rem] px-1.5 text-xs text-neutral-500 hover:text-neutral-950"
                      value={effortValue(effort(), defaultEffort())}
                      title={t("chat.effort.title")}
                      onChange={(e) => setEffort(e.currentTarget.value)}
                    >
                      <For each={effortOptions(efforts(), defaultEffort())}>
                        {(o) => <option value={o.value}>{o.label ?? t("chat.effort.auto")}</option>}
                      </For>
                    </Select>
                  </Show>
                  <Show when={modelo()}>
                    <Button size="sm" variant="ghost" onClick={() => { setModelo(null); setEffort(""); }}>
                      {t("projects.agents.profile_model_reset")}
                    </Button>
                  </Show>
                </div>
                <Show when={!modelo()}>
                  <span class="text-xs text-neutral-500">
                    {t("projects.agents.profile_model_default")}
                  </span>
                </Show>
              </div>

              <label class="grid gap-1">
                <span class="text-xs text-neutral-500">
                  {t("projects.agents.new_description")}
                </span>
                <Input
                  value={description()}
                  placeholder={t("projects.agents.new_description_hint")}
                  onInput={(e) => setDescription(e.currentTarget.value)}
                />
              </label>

              <label class="grid gap-1">
                <span class="text-xs text-neutral-500">
                  {t("projects.agents.new_instructions")}
                </span>
                <Textarea
                  value={instructions()}
                  rows={5}
                  placeholder={t("projects.agents.new_instructions_hint")}
                  onInput={(e) => setInstructions(e.currentTarget.value)}
                />
              </label>

              <Show when={fallo()}>
                {(texto) => (
                  <p class="m-0 text-xs text-error-strong">{texto()}</p>
                )}
              </Show>
              <div class="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => props.onAbrir(false)}>
                  {t("projects.agents.new_cancel")}
                </Button>
                <Button
                  size="sm"
                  disabled={!listo() || guardando() || lockedBy("agents") !== null}
                  onClick={() => void crear()}
                >
                  {guardando()
                    ? t("projects.agents.new_saving")
                    : t("projects.agents.new_create")}
                </Button>
              </div>
            </div>
          }
        >
          {(creado) => (
            <div class="mt-3 grid gap-3">
              <div class="flex items-center gap-3">
                <AstroAvatar name={creado().agent.name} status="asleep" size={34} />
                <span class="font-mono text-xs text-neutral-950">
                  {creado().agent.name}
                </span>
              </div>
              <div class="grid gap-1 rounded-sm border border-warning-strong/30 bg-warning-strong/10 p-2">
                <p class="m-0 text-xs text-warning-strong">
                  {t("projects.agents.new_shadowed")}
                </p>
                <p class="m-0 font-mono text-2xs break-all text-neutral-500">
                  {creado().eclipsado_por?.origin}
                </p>
              </div>
              <div class="flex items-center justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    props.onAbrir(false);
                    limpiar();
                  }}
                >
                  {t("projects.agents.new_understood")}
                </Button>
              </div>
            </div>
          )}
        </Show>
      </DialogContent>
    </Dialog>
  );
}
