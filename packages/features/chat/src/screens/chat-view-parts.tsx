import { t } from "../../../../ui/src/lib/i18n";
import { cn } from "../../../../ui/src/lib/utils";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { Pressable } from "../../../../ui/src/Pressable";
import { Select } from "../../../../ui/src/Select";
import TarjetaDeTerminal from "../components/ShellCard";
import type { VirtualThreadApi } from "../components/VirtualThread";
import YourMessages from "../components/YourMessages";
import { PendingHandoff } from "./thread/PendingHandoff";
import { HOLGURA } from "../model/paste";
import { chunkOf, chunkStart } from "../model/threadWindow";
import type { createChatAttachments } from "./chat-attachments";
import type { createChatBlocks } from "./chat-blocks";
import type { createChatComposer } from "./chat-composer";
import type { createChatComposerState } from "./chat-composer-state";
import type { Bloque } from "./chat-model";
import type { ChatProps } from "./chat-props";
import type { createChatThreadRow } from "./chat-thread-row";
import type { createChatThreadWindow } from "./chat-thread-window";
import type { createChatTurnState } from "./chat-turn-state";
import Pencil from "lucide-solid/icons/pencil";
import { For, Index, Show, createMemo } from "solid-js";
import { Dynamic } from "solid-js/web";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatViewPartsDeps = { Caja: ReturnType<typeof createChatComposer>["Caja"]; altoDeLaCaja: ReturnType<typeof createChatTurnState>["altoDeLaCaja"]; altoEstimado: ReturnType<typeof createChatThreadWindow>["altoEstimado"]; bloques: ReturnType<typeof createChatBlocks>["bloques"]; cajaDelHilo: ReturnType<typeof createChatTurnState>["cajaDelHilo"]; cajaVirtual: ReturnType<typeof createChatThreadWindow>["cajaVirtual"]; centrada: ReturnType<typeof createChatComposerState>["centrada"]; chunks: ReturnType<typeof createChatThreadWindow>["chunks"]; clavesDelHilo: ReturnType<typeof createChatBlocks>["clavesDelHilo"]; elContenido: HTMLElement | undefined; filaDelHilo: ReturnType<typeof createChatThreadRow>["filaDelHilo"]; filasRetenidas: ReturnType<typeof createChatThreadWindow>["filasRetenidas"]; forkAgentChoice: ReturnType<typeof createChatAttachments>["forkAgentChoice"]; forkDesde: ReturnType<typeof createChatAttachments>["forkDesde"]; forkTurn: ReturnType<typeof createChatAttachments>["forkTurn"]; forkeando: ReturnType<typeof createChatComposerState>["forkeando"]; hilo: ReturnType<typeof createChatComposerState>["hilo"]; hiloDeFilas: VirtualThreadApi | undefined; hiloDeFilasListo: ReturnType<typeof createChatThreadWindow>["hiloDeFilasListo"]; hiloVirtual: ReturnType<typeof createChatThreadWindow>["hiloVirtual"]; inputsDelHilo: ReturnType<typeof createChatTurnState>["inputsDelHilo"]; margenDelHilo: ReturnType<typeof createChatComposerState>["margenDelHilo"]; medirCaja: ReturnType<typeof createChatTurnState>["medirCaja"]; mensajeVisto: ReturnType<typeof createChatTurnState>["mensajeVisto"]; origen: ReturnType<typeof createChatThreadWindow>["origen"]; preguntaPendiente: ReturnType<typeof createChatTurnState>["preguntaPendiente"]; presentation: ReturnType<typeof createChatComposerState>["presentation"]; rielVisible: ReturnType<typeof createChatTurnState>["rielVisible"]; saltarALaLectura: ReturnType<typeof createChatThreadWindow>["saltarALaLectura"]; saltarAlMensaje: ReturnType<typeof createChatTurnState>["saltarAlMensaje"]; saludo: ReturnType<typeof createChatComposerState>["saludo"]; setForkAgentChoice: ReturnType<typeof createChatAttachments>["setForkAgentChoice"]; setForkTurn: ReturnType<typeof createChatAttachments>["setForkTurn"]; setPrimeraFila: ReturnType<typeof createChatThreadWindow>["setPrimeraFila"]; tomarHilo: ReturnType<typeof createChatTurnState>["tomarHilo"]; vacia: ReturnType<typeof createChatComposerState>["vacia"]; watchOlder: ReturnType<typeof createChatThreadWindow>["watchOlder"] };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatViewParts(props: ChatProps, deps: ChatViewPartsDeps) {
  const { Caja, altoDeLaCaja, altoEstimado, bloques, cajaDelHilo, cajaVirtual, centrada, chunks, clavesDelHilo, filaDelHilo, filasRetenidas, forkAgentChoice, forkDesde, forkTurn, forkeando, hilo, hiloDeFilasListo, hiloVirtual, inputsDelHilo, margenDelHilo, medirCaja, mensajeVisto, origen, preguntaPendiente, presentation, rielVisible, saltarALaLectura, saltarAlMensaje, saludo, setForkAgentChoice, setForkTurn, setPrimeraFila, tomarHilo, vacia, watchOlder } = deps;
  const DialogoDeContinuacion = () => (
      <Dialog open={forkTurn() !== null} onOpenChange={(open) => { if (!open && !forkeando()) setForkTurn(null); }}>
        <DialogContent>
          <DialogTitle class="text-base font-semibold">{t("chat.continuation.title")}</DialogTitle>
          <Dialog.Description class="my-3 text-sm text-neutral-500">{t("chat.continuation.description")}</Dialog.Description>
          <Show when={(props.forkAgents ?? []).length > 0}>
            <label class="mb-3 flex flex-col gap-1 text-xs text-neutral-500">
              {t("chat.continuation.agent")}
              <Select
                value={forkAgentChoice()}
                disabled={forkeando() !== null}
                onChange={(e) => setForkAgentChoice(e.currentTarget.value)}
              >
                <option value="">{t("chat.continuation.no_agent")}</option>
                <For each={props.forkAgents}>{(name) => <option value={name}>{name}</option>}</For>
              </Select>
            </label>
          </Show>
          <div class="flex flex-col gap-2">
            <Button variant="outline" disabled={forkeando() !== null} onClick={() => void forkDesde("full")}>{t("chat.continuation.full")}</Button>
            <Button variant="outline" disabled={forkeando() !== null} onClick={() => void forkDesde("focused")}>{t("chat.continuation.focused")}</Button>
            <Button variant="ghost" disabled={forkeando() !== null} onClick={() => setForkTurn(null)}>{t("chat.continuation.cancel")}</Button>
          </div>
        </DialogContent>
      </Dialog>
  );

  const CabeceraDelEncargado = () => (
      <Show when={!props.agentDraft ? props.chatEncargado : null}>
        {(name) => (
          /* La cabecera entera abre el perfil, como el contacto de un chat:
             un botón aparte al lado sería un segundo destino para lo mismo. */
          <header class="relative z-10 flex shrink-0 items-center gap-3 bg-transparent px-4 py-2.5">
            <Pressable
              class="flex min-w-0 flex-1 items-center gap-3 rounded-sm border-0 bg-transparent p-0 text-left outline-none hover:opacity-80 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              disabled={!props.onOpenProfile}
              title={t("projects.agents.profile_open")}
              onClick={() => props.onOpenProfile?.()}
            >
              {props.renderAvatar({
                name: name(),
                status: props.chatEstado ?? "awake",
                body: props.chatBody,
                avatar: props.chatAvatar,
                size: 44,
              })}
              {/* Solo el nombre: el estado ya lo dice la cara, y escribirlo
                  además deja dos rótulos del mismo estado en la misma barra. */}
              <div class="min-w-0 truncate text-[0.95rem] leading-tight font-semibold">
                {props.chatName?.trim() || name()}
              </div>
            </Pressable>
          </header>
        )}
      </Show>
  );

  const HiloConScroll = () => (
      <div
        class={cn(
          "relative min-h-0 flex-1 overflow-auto [overflow-anchor:none]",
          margenDelHilo,
        )}
        ref={tomarHilo}
        style={props.chatEncargado ? { "clip-path": `inset(0 0 ${altoDeLaCaja()}px 0)` } : undefined}
      >
        <div ref={watchOlder} class="pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden="true" />
        <Show when={rielVisible()}>
          <YourMessages
            messages={inputsDelHilo()}
            active={mensajeVisto()}
            visibleHeight={cajaDelHilo().alto - altoDeLaCaja()}
            onJump={saltarAlMensaje}
            bodyOf={props.bodyOf}
            avatarOf={props.avatarOf}
            renderAvatar={props.renderAvatar}
          />
        </Show>
        <div
          data-chat-thread
          class={cn(
            "mx-auto grid w-full gap-y-1.5",
            "max-w-[964px] px-[52px] grid-cols-[minmax(0,1fr)]",
          )}
          ref={(el) => {
            hilo.contenido(el);
            deps.elContenido = el;
          }}
        >
          {/* La transcripción solo añade al final; el último bloque puede pasar
              de ejecución viva a turno cerrado. `For` identifica por el objeto
              y `bloques()` fabrica objetos nuevos con cada delta: desmontaba
              también las filas antiguas, perdía el ancla de lectura y hacía
              que WebKit encogiera y recompusiera el hilo en dos movimientos.
              `Index` conserva cada sitio del DOM y solo actualiza sus datos. */}
          <Show
            when={hiloDeFilasListo() ? cajaVirtual() : undefined}
            keyed
            fallback={
              <Show when={!hiloVirtual}>
                <For each={chunks()}>
                  {(chunk) => (
                    <Index each={chunkOf(bloques(), chunk, origen())}>
                      {(bloque, blockIndex) => filaDelHilo(bloque, () => chunkStart(chunk, origen()) + blockIndex)}
                    </Index>
                  )}
                </For>
              </Show>
            }
          >
            {(caja) => (
              <Dynamic
                component={hiloDeFilasListo()!}
                scroller={caja.el}
                keys={() => clavesDelHilo().lista}
                estimate={altoEstimado}
                retained={filasRetenidas}
                write={hilo.escribir}
                settled={hilo.sostener}
                onRange={setPrimeraFila}
                ref={(api: VirtualThreadApi) => { deps.hiloDeFilas = api; saltarALaLectura(); }}
                row={(clave: string, indice: () => number) => {
                  // La lista de filas puede ir un paso detrás de las claves: una que ya salió no se pinta.
                  const inicial = clavesDelHilo().deClave.get(clave);
                  return inicial ? filaDelHilo(createMemo<Bloque>((previo) => clavesDelHilo().deClave.get(clave) ?? previo, inicial), indice) : null;
                }}
              />
            )}
          </Show>

          {/* Mientras el turno viva, y sin más condiciones: con «y el
              último mensaje no es del agente» el renglón se apagaba con la
              primera palabra que escribiera y no volvía, dejando sin nada
              el tramo más largo de un turno lento —donde solo hay rótulo
              de bloque de trabajo, que existe cuando hay un paso o una
              duración. Ver `EstadoDelTurno`. */}
          <Show when={props.busy ? props.terminal : null}>
            {(vivo) => (
              <TarjetaDeTerminal
                command={vivo().command}
                cwd={vivo().cwd}
                output={vivo().output}
                truncated={vivo().truncated}
                vivo={{ desde: vivo().desde, deteniendo: Boolean(props.stopping), onDetener: () => void props.onStop() }}
              />
            )}
          </Show>

          <PendingHandoff handoff={props.handoff ?? null} showStatus={props.handoff?.phase === "waiting-close" || !props.activities?.some(activity => activity.active)} bubble={presentation().UserBubble} userClass={presentation().userMessage} miniatura={props.onMiniatura} preview={props.onPreview} renderPdf={props.renderPdf} />

          <div
            class="col-span-full"
            aria-hidden="true"
            style={{ height: `${altoDeLaCaja() + HOLGURA + 12}px`, "flex-shrink": 0 }}
          />
        </div>
      </div>
  );

  const CapaDeLaCaja = () => (
      <Show when={!props.soloLectura || preguntaPendiente() || props.recovery}>
        <Show when={props.agentDraft && centrada() ? props.chatEncargado : null} fallback={
        <div
          class={cn("pointer-events-none absolute inset-0 z-20 flex min-h-0 flex-col items-center overflow-hidden", centrada() ? "justify-center" : "justify-end")}
        >
          <Show when={centrada() ? props.chatEncargado : null}>
            {(name) => <div class="pointer-events-auto mx-auto flex max-w-[860px] flex-col items-center gap-3 px-6 text-center">
              <Pressable class="rounded-sm focus-visible:outline-2 focus-visible:outline-primary" aria-label={t("projects.agents.profile_open")} title={t("projects.agents.profile_open")} onClick={() => props.onOpenProfile?.()}>
                {props.renderAvatar({ name: name(), status: props.chatEstado ?? "awake", body: props.chatBody, avatar: props.chatAvatar, size: 56 })}
              </Pressable>
              <h1 class="m-0 font-display text-xl font-bold text-neutral-950">{props.chatName?.trim() || name()}</h1>
              <Show when={props.chatDescription}><p class="m-0 max-w-[36rem] text-sm text-neutral-700">{props.chatDescription}</p></Show>
            </div>}
          </Show>
          <Show when={centrada() && !props.chatEncargado && !props.recovery ? saludo() : null}>
            {(texto) => (
              <h1 class="m-0 mb-6 max-w-[860px] px-6 text-center font-display text-3xl font-bold tracking-[-0.02em] text-neutral-950">
                {texto()}
              </h1>
            )}
          </Show>
          {/* El puntero vuelve aquí: la capa entera lo deja pasar para que se
              pueda seleccionar el texto que sigue visible detrás. */}
          <div
            ref={medirCaja}
            class={cn(
              "pointer-events-auto relative flex max-h-full min-h-0 w-full flex-col items-center overflow-hidden",
              presentation().composerBar,
              props.besideFiles && "pr-0",
            )}
          >
            <Show when={props.recovery} fallback={<Caja />}>{props.recovery}</Show>
            {/* Solo sin hilo: una sesión ya empezada pertenece a su proyecto,
                y cambiarlo aquí no la movería de sitio. */}
            <Show when={vacia()}>{props.proyecto}</Show>
          </div>
        </div>
        }>
          {(name) => (
            /* Cada columna es `sticky`: la más larga marca el alto de la fila y se
               desplaza, la corta se queda. Un `overflow` entre ellas y este
               contenedor anula el `sticky` sin dar error. */
            <div data-agent-page class="absolute inset-0 z-20 overflow-y-auto [container-type:size]">
              <div class="mx-auto grid w-full max-w-[1224px] items-start gap-x-14 gap-y-8 px-6 pb-12 @5xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] @5xl:px-14 @5xl:pb-0">
                {/* `100cqh` es el alto visible del panel: centra el composer
                    aunque la lista de tareas de al lado sea más larga. */}
                <div class="flex min-w-0 flex-col gap-2.5 pt-10 @5xl:sticky @5xl:top-0 @5xl:min-h-[100cqh] @5xl:justify-center @5xl:py-10">
                  <header class="mb-3 flex min-w-0 items-start gap-4">
                    <Pressable class="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label={t("projects.agents.profile_open")} title={t("projects.agents.profile_open")} onClick={() => props.onOpenProfile?.()}>
                      {props.renderAvatar({ name: name(), status: props.chatEstado ?? "awake", body: props.chatBody, avatar: props.chatAvatar, size: 52 })}
                    </Pressable>
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                      <div class="flex min-w-0 items-center gap-2">
                        <h1 class="m-0 min-w-0 flex-1 truncate font-display text-2xl font-bold text-neutral-950">{props.chatName?.trim() || name()}</h1>
                        <Show when={props.onOpenProfile}>
                          <Button variant="ghost" size="icon" class="size-7 shrink-0 text-neutral-500" aria-label={t("projects.agents.profile_open")} title={t("projects.agents.profile_open")} onClick={() => props.onOpenProfile?.()}>
                            <Pencil size={15} />
                          </Button>
                        </Show>
                      </div>
                      <Show when={props.chatDescription}><p class="m-0 text-sm text-neutral-700">{props.chatDescription}</p></Show>
                    </div>
                  </header>
                  <Show when={props.recovery} fallback={<Caja />}>{props.recovery}</Show>
                  {props.proyecto}
                  {props.recentTasks}
                </div>
                <div class="min-w-0 @5xl:sticky @5xl:top-6 @5xl:pt-10 @5xl:pb-12">{props.agentTasks}</div>
              </div>
            </div>
          )}
        </Show>
      </Show>
  );
  return { CabeceraDelEncargado, CapaDeLaCaja, DialogoDeContinuacion, HiloConScroll };
}
