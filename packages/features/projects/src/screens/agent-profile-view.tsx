import { invoke } from "@tauri-apps/api/core";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import EyeOff from "lucide-solid/icons/eye-off";
import FolderOpen from "lucide-solid/icons/folder-open";
import ImagePlus from "lucide-solid/icons/image-plus";
import Trash2 from "lucide-solid/icons/trash-2";
import { Show } from "solid-js";
import { SelectorDeModelo } from "../model/ports";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { Input } from "../../../../ui/src/Input";
import { Textarea } from "../../../../ui/src/Textarea";
import { AstroAvatar } from "./AstroAvatar";
import { BodyPicker } from "../components/BodyPicker";
import { TelegramSection } from "../components/TelegramSection";
import { LazyPart, retryableLazy } from "../../../../ui/src/LazyPart";
import { Pressable } from "../../../../ui/src/Pressable";
import { LABEL, SECTION, type AgentProfileProps } from "./agent-profile-model";
import { createAgentProfile } from "./agent-profile-state";
const HandlerPolicy = retryableLazy(() => import("./HandlerPolicy"));

/**
 * El perfil de un agente, dentro de la pestaña de su conversación.
 *
 * El nombre que se edita aquí es el que se lee; el declarado no se toca, que es
 * la clave de sus tareas y de su memoria (`docs/custom-agents.md` § Alcance).
 * Las instrucciones de uno del repositorio solo se muestran (`edit_own`).
 */
export default function AgentProfile(props: AgentProfileProps) {
  const { name, setName, save, description, setDescription, saveDeclaration, opciones, superficieElegida, modelChoice, elegirModeloDelAgente, agentChoice, olvidarEleccion, body, profile, elegirCara, setAvatar, chooseBackground, setBackground, visibility, instructions, setInstructions, ocultar, setConfirmando, confirmando, borrando, borrar, failure } = createAgentProfile(props);
  return (
    <div class="flex min-h-0 flex-1 flex-col bg-surface">
      <header class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Pressable
          class="grid size-7 place-items-center rounded-sm border-0 bg-transparent text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={t("projects.agents.profile_back")}
          title={`${t("projects.agents.profile_back")} (Esc)`}
          onClick={() => props.onClose()}
        >
          <ArrowLeft size={16} />
        </Pressable>
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
                createFreeRouterConsent={props.createFreeRouterConsent}
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
                <Input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  variant="range"
                  class="w-full"
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

          <Show when={props.handlerPolicy}>{target => <LazyPart><HandlerPolicy name={props.agent.name} target={target()} /></LazyPart>}</Show>
          <TelegramSection project={props.project} name={props.agent.name} />

          <section class={SECTION}>
            <Show
              when={props.agent.own && props.agent.package !== "business"}
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
