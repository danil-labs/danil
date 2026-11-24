import { enfocar } from "../../../../ui/src/lib/focus";
import { t } from "../../../../ui/src/lib/i18n";
import { modelBrand } from "../../../../ui/src/lib/models";
import { prosa } from "../../../../ui/src/lib/prose";
import { nombreDe } from "../../../../ui/src/lib/steps";
import { cn } from "../../../../ui/src/lib/utils";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { FailureNote } from "../../../../ui/src/Failure";
import { Pressable } from "../../../../ui/src/Pressable";
import { MARCA_SIN_ELEGIR } from "../../../../ui/src/lib/surfaceMarks";
import { Adjunto, rodarEnHorizontal } from "./Attachments";
import VentanaDeContexto from "../components/ContextWindow";
import ColaDeMensajes from "../components/MessageQueue";
import SelectorDeModo from "../components/ModePicker";
import Alcance from "./Scope";
import { PanelAlMargen } from "../components/SideQuestion";
import { ComposerAction } from "../components/composer/ComposerAction";
import type { createChatAttachments } from "./chat-attachments";
import type { createChatComposerField } from "./chat-composer-field";
import type { createChatComposerInput } from "./chat-composer-input";
import type { createChatComposerPrompts } from "./chat-composer-prompts";
import type { createChatComposerState } from "./chat-composer-state";
import { SelectorDeModelo } from "./chat-model";
import type { ChatProps } from "./chat-props";
import type { createChatTurnState } from "./chat-turn-state";
import CornerDownLeft from "lucide-solid/icons/corner-down-left";
import MessageCircleQuestion from "lucide-solid/icons/message-circle-question-mark";
import Paperclip from "lucide-solid/icons/paperclip";
import SquareTerminal from "lucide-solid/icons/square-terminal";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import X from "lucide-solid/icons/x";
import { For, Show } from "solid-js";
import { Input } from "../../../../ui/src/Input";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatComposerDeps = { CampoDeLaCaja: ReturnType<typeof createChatComposerField>["CampoDeLaCaja"]; MenuDeSugerencias: ReturnType<typeof createChatComposerPrompts>["MenuDeSugerencias"]; PermisoDeLaCaja: ReturnType<typeof createChatComposerPrompts>["PermisoDeLaCaja"]; PreguntaDeLaCaja: ReturnType<typeof createChatComposerPrompts>["PreguntaDeLaCaja"]; actual: ReturnType<typeof createChatComposerState>["actual"]; attachmentFailure: ReturnType<typeof createChatComposerState>["attachmentFailure"]; bloqueoDeSuperficie: ReturnType<typeof createChatComposerState>["bloqueoDeSuperficie"]; cambiarModo: ReturnType<typeof createChatComposerState>["cambiarModo"]; campo: HTMLTextAreaElement | undefined; carpetaDeTerminal: ReturnType<typeof createChatTurnState>["carpetaDeTerminal"]; composerBox: HTMLDivElement | undefined; efforts: ReturnType<typeof createChatComposerState>["efforts"]; elegido: ReturnType<typeof createChatComposerState>["elegido"]; elegirArchivos: ReturnType<typeof createChatAttachments>["elegirArchivos"]; entradaActiva: ReturnType<typeof createChatTurnState>["entradaActiva"]; entradaArchivo: HTMLInputElement | undefined; faltaUnanime: ReturnType<typeof createChatComposerState>["faltaUnanime"]; fuentes: ReturnType<typeof createChatTurnState>["fuentes"]; listo: ReturnType<typeof createChatComposerState>["listo"]; mandar: ReturnType<typeof createChatAttachments>["mandar"]; menuOpen: ReturnType<typeof createChatComposerInput>["menuOpen"]; modoAlMargen: ReturnType<typeof createChatTurnState>["modoAlMargen"]; modoTerminal: ReturnType<typeof createChatTurnState>["modoTerminal"]; opciones: ReturnType<typeof createChatComposerState>["opciones"]; preguntaPendiente: ReturnType<typeof createChatTurnState>["preguntaPendiente"]; preguntaPlegada: ReturnType<typeof createChatComposerState>["preguntaPlegada"]; presentation: ReturnType<typeof createChatComposerState>["presentation"]; pulsoDeModo: ReturnType<typeof createChatComposerState>["pulsoDeModo"]; setSoltadoDe: ReturnType<typeof createChatTurnState>["setSoltadoDe"]; trigger: ReturnType<typeof createChatComposerState>["trigger"] };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatComposer(props: ChatProps, deps: ChatComposerDeps) {
  const { CampoDeLaCaja, MenuDeSugerencias, PermisoDeLaCaja, PreguntaDeLaCaja, actual, attachmentFailure, bloqueoDeSuperficie, cambiarModo, carpetaDeTerminal, efforts, elegido, elegirArchivos, entradaActiva, faltaUnanime, fuentes, listo, mandar, menuOpen, modoAlMargen, modoTerminal, opciones, preguntaPendiente, preguntaPlegada, presentation, pulsoDeModo, setSoltadoDe, trigger } = deps;
  const BarraDeLaCaja = () => (
        <div class="flex min-w-0 items-center gap-1 px-2">
          {/* Vuelve a abrir el diálogo de archivos de golpe. Contexto y
              código tienen su propia fila encima de la caja, con su `+` y
              sus paneles anclados a él (`Alcance`): lo único que este botón
              significa es adjuntar un archivo a este mensaje, y un menú de
              una sola opción sería un clic de más. */}
          <Show when={!modoTerminal()}>
          <Button
            type="button"
            variant="ghost"
            size="iconCompact"
            class="shrink-0 rounded-full"
            disabled={!listo()}
            title={t("chat.attachments.add")}
            aria-label={t("chat.attachments.add")}
            onClick={() => void elegirArchivos()}
          >
            <Paperclip size={16} />
          </Button>
          </Show>

          {/* Al lado de adjuntar, y a la izquierda de todo lo demás: decide
              con qué arranca lo que viene —material y vigilancia—, y lo de
              la derecha ajusta la respuesta. Pegado a la caja, foco de
              `shift+tab`. Se enseña aunque solo haya un modo utilizable:
              con Codex o Antigravity es la única forma de enterarse de por
              qué no hay nada que elegir. */}
          <Show when={props.modos.length > 0 && !modoTerminal()}>
            <SelectorDeModo
              modo={props.modo}
              modos={props.modos}
              disabled={!listo()}
              pulso={pulsoDeModo()}
              onChange={cambiarModo}
            />
          </Show>

          {/* Con qué responde, a la derecha: ajusta la respuesta y no es la
              acción —el botón del final—. Se mueve con un turno corriendo:
              vale para lo que se escriba ahora, lo que ya está en cola se
              queda con el suyo. Lo primero del grupo no es un ajuste: es el
              medidor de memoria, lectura y no control —no responde al
              clic—, lo que hay que saber antes del turno siguiente. */}
          <div class="ml-auto flex min-w-0 items-center gap-1">
            {/* Sin `agente`: el rótulo del que no mide sale del catálogo
                («Este agente»), y aquí el nombre legible del agente elegido
                vive en la superficie, no en esta fila. */}
            <Show when={!modoTerminal()}>
              <VentanaDeContexto ventana={props.ventana} />
            </Show>
            {/* Sin nada con qué trabajar no hay menú, hay una salida: en el
                primer arranque el desplegable no tendría ni una entrada. Va
                por «ninguna se puede usar» y no por «la lista está vacía»:
                un agente desconectado deja una entrada y ninguna utilizable,
                y ahí también hace falta. El rótulo cambia con lo que falta;
                el porqué entero va en el título de la superficie. */}
            <Show
              when={props.superficies && !props.superficies.some((s) => s.usable)}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={props.onConectar}
                // Sin frase no se pone el atributo: «sin elegir» no trae
                // ninguna (`surfaces::sin_cuenta`) y un `title=""` es un
                // tooltip vacío donde no debería haber ninguno.
                title={(() => {
                  const falta = faltaUnanime()?.porque;
                  return falta ? prosa(falta) : undefined;
                })()}
              >
                {faltaUnanime()?.marca === MARCA_SIN_ELEGIR
                  ? t("chat.account.pick")
                  : t("chat.account.connect")}
              </Button>
            </Show>

            <Show when={props.superficies != null && !modoTerminal()}>
              {/* Una opción decide agente, superficie y modelo. Separarlos hacía
                  imposible buscar Claude, Codex y OpenCode en el mismo menú.
                  La marca sale del agente que sirve la superficie: «OpenCode»
                  y «Modelos gratuitos» son dos entradas del mismo proveedor. */}
              <SelectorDeModelo
                pildora
                createFreeRouterConsent={props.createFreeRouterConsent}
                invokeOptions={props.modelOptions}
                marca={modelBrand(actual()?.provider ?? props.agent, props.model)}
                models={opciones()}
                superficie={props.superficie}
                model={props.model}
                missingModelLabel={props.nativeSubagent ? t("chat.model.unreported") : undefined}
                disabled={props.modelLocked}
                disabledReason={
                  props.agentLocked && props.agentLockedReason
                    ? props.agentLockedReason
                    : props.nativeSubagent ? t("chat.model.native") : props.modelLocked ? t("chat.model.locked") : undefined
                }
                onChange={props.onModel}
                lockedAgent={props.agentLocked ? props.agent : undefined}
                lockedReason={props.agentLocked ? props.agentLockedReason ?? t("chat.handover.unsupported") : null}
                efforts={efforts()}
                defaultEffort={elegido()?.default_effort ?? null}
                effort={props.effort}
                onEffort={props.onEffort}
              />
            </Show>

            {/* Un solo sitio y un solo acto posible por estado: enviar cuando
                está libre, detener cuando el agente trabaja. */}
            <Show when={modoTerminal() && !props.busy}>
              <Button
                type="submit"
                variant="terminal"
                size="sm"
                class="h-8 shrink-0 gap-1.5 rounded-full px-3 text-xs font-semibold"
                disabled={!listo() || !props.input.slice(1).trim()}
              >
                <CornerDownLeft size={14} aria-hidden="true" />
                {t("chat.composer.run")}
              </Button>
            </Show>
            <Show when={!modoTerminal() || props.busy}>
            <ComposerAction busy={props.busy} stopping={props.stopping} hasMessage={Boolean(props.input.trim() || props.adjuntos.length)} canSend={listo()} onStop={props.onStop} />
            </Show>
          </div>
        </div>
  );

  const Caja = () => (
    <div
      ref={deps.composerBox}
      class={cn(
        "relative flex max-h-full min-h-0 w-full flex-col overflow-hidden",
        "max-w-[860px]",
        !props.permission && preguntaPendiente() && !preguntaPlegada() && "h-full",
      )}
    >
      {/* El menú va a <body>: aquí dentro lo recortan la caja y las dos capas
          que la contienen, todas con overflow-hidden. */}
      <MenuDeSugerencias />

      {/* Pegada a la caja y encima: lo que va a salir después está donde se
          escribió, no en una columna aparte. */}
      <ColaDeMensajes {...props.cola} handoffItemId={props.handoff?.queueItemId} compact={presentation().compactQueue} onOpenTask={props.onOpenTask} />

      {/* Las dos interrupciones viven en el mismo sitio, pero no pesan igual.
          La pregunta es una decisión de producto; el permiso ejecuta algo y
          exige un acto separado, con el literal que Rust conserva. */}
      <PermisoDeLaCaja />

      {/* Encima de la caja: lo que la tarea lee se ve antes de escribir, no
          dentro del control de escribir. Dónde escribe no es una fuente: es
          la carpeta de trabajo del proyecto, en el panel de la columna. */}
      <Alcance
        rotulo={t("chat.scope.sources")}
        agregar={t("chat.scope.sources_add")}
        items={fuentes()}
        materialOptions={props.materialOptions}
        materialTarget={props.materialTarget}
        materialAvailable={props.materialAvailable}
        bloqueado={props.busy}
        onTraer={props.onAdjuntarFuente}
        onQuitar={props.onQuitarFuente}
        onCambiarRama={props.onCambiarRama}
      />

      <form
        class={cn(
          !props.permission && preguntaPendiente()
            ? cn(
                "grid max-h-full min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-lg border border-border-strong bg-surface-raised shadow-md",
                !preguntaPlegada() && "h-full",
              )
            : cn(
                "grid min-w-0 gap-1.5 rounded-lg border border-border-strong bg-surface-raised px-1 pt-0.5 pb-1.5 shadow-md",
                presentation().composer,
                (modoAlMargen() || (menuOpen() && trigger()?.kind === "/")) && "border-primary/50",
                // Se ve antes de mandar que esto no va al modelo.
                modoTerminal() && "border-neutral-950",
              ),
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void mandar();
        }}
      >
        <Input
          ref={deps.entradaArchivo}
          type="file"
          multiple
          variant="filePicker"
          onChange={(e) => {
            // El `<input type=file>` del webview tampoco da rutas de disco:
            // el selector real es el de Tauri. Este existe solo para que el
            // botón sea un control de archivo de verdad ante el sistema.
            e.currentTarget.value = "";
            void elegirArchivos();
          }}
        />

        <PreguntaDeLaCaja />

        <Show when={!preguntaPendiente() || props.permission}>

        <Show when={attachmentFailure()}>
          {(failure) => <FailureNote f={failure()} />}
        </Show>

        {/* Aquí solo van los archivos, no el material: el material vive en
            las filas de alcance de arriba, ponerlo también aquí lo
            enseñaría dos veces en la misma pantalla, con dos formas de
            quitarlo que hacen cosas distintas. Un archivo sí es de este
            mensaje y solo de este. */}
        <Show when={props.adjuntos.length > 0}>
          {/* Una fila y no varias: si envuelve, la bandeja crece hasta tapar
              el campo de texto. */}
          <div
            class="flex gap-2 overflow-x-auto overflow-y-hidden px-1 pt-1 pb-1 select-none"
            onWheel={rodarEnHorizontal}
          >
            <For each={props.adjuntos}>
              {(p) => (
                <div class="group relative shrink-0">
                  <Adjunto rel={p} miniatura={props.onMiniatura} preview={props.onPreview} renderPdf={props.renderPdf} />
                  {/* Dentro de la esquina: fuera de ella, el scroll horizontal la recorta. */}
                  <Pressable
                    class="absolute top-1 right-1 grid size-[1.125rem] place-items-center rounded-full bg-neutral-950 text-neutral-50 opacity-0 ring-2 ring-surface-raised transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
                    aria-label={t("chat.attachments.remove", {
                      name: nombreDe(p),
                    })}
                    title={t("chat.attachments.remove", { name: nombreDe(p) })}
                    onClick={() =>
                      props.onAdjuntos(props.adjuntos.filter((x) => x !== p))
                    }
                  >
                    <X size={11} />
                  </Pressable>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={modoAlMargen() && props.sideCommand}>
          {(comando) => (
            <div class="flex min-w-0 items-center gap-2 px-2 pt-1.5">
              <span class="inline-flex h-5 items-center gap-1 rounded-[5px] bg-side/10 px-[7px] text-xs font-medium text-side">
                <MessageCircleQuestion size={12} aria-hidden="true" />
                /{comando()}
              </span>
              <span class="min-w-0 truncate text-caption text-neutral-500">{t("chat.side.mode")}</span>
            </div>
          )}
        </Show>

        <Show when={props.alMargen}>
          {(estado) => (
            <PanelAlMargen
              estado={estado()}
              onCerrar={() => props.onCerrarAlMargen?.()}
              onPasarAlHilo={() => props.onPasarAlHilo?.()}
              onSeguir={() => {
                props.onInput(`/${props.sideCommand ?? "btw"} `);
                if (deps.campo) enfocar(deps.campo);
              }}
            />
          )}
        </Show>

        <Show when={modoTerminal() || (props.terminal?.id && props.onEntradaDeComando)}>
          <div class="flex min-w-0 items-center gap-2 px-2 pt-1.5">
            <Show
              when={modoTerminal()}
              fallback={
                <Pressable
                  class="flex h-5 items-center gap-1 rounded-[5px] px-[7px] text-caption font-medium text-neutral-700 outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => {
                    setSoltadoDe(null);
                    if (deps.campo) enfocar(deps.campo);
                  }}
                >
                  <SquareTerminal size={12} aria-hidden="true" />
                  {t("chat.composer.stdin.attach")}
                </Pressable>
              }
            >
              <Badge forma="dato" tone="terminal" class="h-5 gap-1 rounded-[5px] px-[7px] py-0 font-sans font-medium">
                <SquareTerminal size={12} aria-hidden="true" />
                {entradaActiva() ? t("chat.composer.stdin") : t("chat.composer.terminal")}
              </Badge>
            </Show>
            <Show when={entradaActiva()}>
              <span class="min-w-0 truncate text-caption text-neutral-500">{t("chat.composer.stdin.hint")}</span>
            </Show>
            <Show when={!entradaActiva() && carpetaDeTerminal()}>
              {(carpeta) => (
                <span class="min-w-0 truncate font-mono text-caption text-neutral-500" title={carpeta()}>
                  {carpeta()}
                </span>
              )}
            </Show>
          </div>
        </Show>

        <CampoDeLaCaja />

        <Show when={bloqueoDeSuperficie()}>
          {(motivo) => (
            <p class="m-0 flex items-start gap-1.5 px-2 text-xs text-warning-strong">
              <TriangleAlert size={14} class="mt-0.5 shrink-0" />
              <span>{motivo()}</span>
            </p>
          )}
        </Show>

        <BarraDeLaCaja />
        </Show>

      </form>
    </div>
  );
  return { Caja };
}
