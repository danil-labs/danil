import ArrowDown from "lucide-solid/icons/arrow-down";
import FileText from "lucide-solid/icons/file-text";
import { Show } from "solid-js";
import type { VirtualThreadApi } from "../components/VirtualThread";
import { type Lectura } from "../model/threadWindow";
import { type PendingEdit } from "../../../../../apps/desktop/src/lib/taskMentions";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../ui/src/lib/utils";
import { Button } from "../../../../ui/src/Button";
import { FileMachine } from "../../../../ui/src/fileMachine";
import { WorkFace } from "../model/workFace";
import { Skeleton } from "../../../../ui/src/Skeleton";
import { Pressable } from "../../../../ui/src/Pressable";
import { type ChatProps } from "./chat-props";
import { createChatComposerState } from "./chat-composer-state";
import { createChatComposerInput } from "./chat-composer-input";
import { createChatAttachments } from "./chat-attachments";
import { createChatBlocks } from "./chat-blocks";
import { createChatThreadWindow } from "./chat-thread-window";
import { createChatTurnState } from "./chat-turn-state";
import { createChatComposerPrompts } from "./chat-composer-prompts";
import { createChatComposerField } from "./chat-composer-field";
import { createChatComposer } from "./chat-composer";
import { createChatUserRow } from "./chat-user-row";
import { createChatThreadRow } from "./chat-thread-row";
import { createChatViewParts } from "./chat-view-parts";


export default function Chat(props: ChatProps) {
  let ancla: HTMLSpanElement | undefined;
  let campo: HTMLTextAreaElement | undefined;
  let reclamaElFoco = false;
  let mirror: HTMLDivElement | undefined;
  let entradaArchivo: HTMLInputElement | undefined;
  let pendingCaret: number | null = null;
  let pendingEdit: PendingEdit | undefined;
  const { actual, attachmentFailure, bloqueoDeSuperficie, cambiarModo, centrada, commandNames, copiado, copiando, dirigido, dismissed, efforts, elegido, esElVivo, escribible, esperaVisible, faltaUnanime, fieldSpans, forkeando, hasHighlight, hilo, listo, margenDelHilo, opciones, pick, preguntaPlegada, preguntasPlegadas, presentation, pulsoDeModo, razonamientos, respuestaRapida, saludo, setAttachmentFailure, setCaret, setCopiado, setCopiando, setDismissed, setForkeando, setPick, setPlegadaEn, setPreguntasPlegadas, setPreparingAttachments, setRazonamientos, setSoltando, setTrabajos, skillNames, slashGroups, soltando, tomarCampo, trabajos, trigger, vacia, visualBudget } = createChatComposerState(props, { get campo() { return campo; }, set campo(v) { campo = v; }, get preguntaPendiente() { return preguntaPendiente; }, get reclamaElFoco() { return reclamaElFoco; }, set reclamaElFoco(v) { reclamaElFoco = v; } });

  const { habilitada, insertSuggestion, mensajesNuevos, menuOpen, picked, suggestions } = createChatComposerInput(props, { dismissed, hilo, pick, setCaret, slashGroups, trigger, vacia, get bloqueDeLectura() { return bloqueDeLectura; }, get campo() { return campo; }, set campo(v) { campo = v; }, get hiloVirtual() { return hiloVirtual; }, get lecturaPorSaltar() { return lecturaPorSaltar; }, set lecturaPorSaltar(v) { lecturaPorSaltar = v; }, get origen() { return origen; }, get pendingCaret() { return pendingCaret; }, set pendingCaret(v) { pendingCaret = v; }, get reclamaElFoco() { return reclamaElFoco; }, set reclamaElFoco(v) { reclamaElFoco = v; }, get saltarALaLectura() { return saltarALaLectura; }, get shownFrom() { return shownFrom; } });

  const { abrirFork, copiarMensaje, elegirArchivos, forkAgentChoice, forkDesde, forkTurn, mandar, pegar, setForkAgentChoice, setForkTurn, ultimoEscrito } = createChatAttachments(props, { copiando, forkeando, hilo, listo, setAttachmentFailure, setCopiado, setCopiando, setForkeando, setPreparingAttachments, setSoltando, get ancla() { return ancla; }, set ancla(v) { ancla = v; }, get entrada() { return entrada; }, get entradaActiva() { return entradaActiva; }, get puedeAdjuntar() { return puedeAdjuntar; }, get teclearAlComando() { return teclearAlComando; } });
  const { activityBlocked, bloqueDeLectura, bloques, claveFila, clavesDelHilo, esLaTiraViva, handoffStarting, isCurrentActivity, registroCorre, searchMessages } = createChatBlocks(props, { esElVivo, razonamientos, setRazonamientos, setTrabajos, trabajos });
  let hiloDeFilas: VirtualThreadApi | undefined;
  let lecturaPorSaltar: Lectura | null = null;
  const { altoEstimado, cajaVirtual, chunks, filaDe, filasRetenidas, hiloDeFilasListo, hiloVirtual, motivos, origen, pedirAntiguos, retenerFila, saltarALaLectura, setCajaDeFilas, setFirstChunk, setPrimeraFila, setRetenidas, shownFrom, volverAReciente, watchOlder } = createChatThreadWindow(props, { bloqueDeLectura, bloques, clavesDelHilo, hilo, get hiloDeFilas() { return hiloDeFilas; }, set hiloDeFilas(v) { hiloDeFilas = v; }, get lecturaPorSaltar() { return lecturaPorSaltar; }, set lecturaPorSaltar(v) { lecturaPorSaltar = v; } });

  let elContenido: HTMLElement | undefined;
  let composerBox: HTMLDivElement | undefined;
  const { altoDeLaCaja, cajaDelHilo, cancelarPregunta, carpetaDeTerminal, entrada, entradaActiva, entradaOculta, fuentes, inputsDelHilo, interrumpirConCola, interruptibles, medirCaja, mensajeVisto, menuAnchor, modoAlMargen, modoTerminal, pieDeTerminal, preguntaPendiente, puedeAdjuntar, respondido, rielVisible, saltarAlMensaje, setEntrada, setSoltadoDe, teclearAlComando, tomarHilo } = createChatTurnState(props, { bloques, filaDe, hilo, hiloVirtual, menuOpen, motivos, origen, retenerFila, searchMessages, setCajaDeFilas, setFirstChunk, setRetenidas, shownFrom, get composerBox() { return composerBox; }, set composerBox(v) { composerBox = v; }, get elContenido() { return elContenido; }, set elContenido(v) { elContenido = v; }, get hiloDeFilas() { return hiloDeFilas; }, set hiloDeFilas(v) { hiloDeFilas = v; } });

  const { MenuDeSugerencias, PermisoDeLaCaja, PreguntaDeLaCaja } = createChatComposerPrompts(props, { cancelarPregunta, insertSuggestion, menuAnchor, menuOpen, picked, preguntaPendiente, preguntaPlegada, setPlegadaEn, suggestions, trigger });

  const { CampoDeLaCaja } = createChatComposerField(props, { cambiarModo, dirigido, entrada, entradaActiva, entradaOculta, escribible, fieldSpans, habilitada, hasHighlight, insertSuggestion, interrumpirConCola, interruptibles, mandar, menuOpen, modoTerminal, pegar, picked, setCaret, setDismissed, setEntrada, setPick, setSoltadoDe, suggestions, teclearAlComando, tomarCampo, get mirror() { return mirror; }, set mirror(v) { mirror = v; }, get pendingCaret() { return pendingCaret; }, set pendingCaret(v) { pendingCaret = v; }, get pendingEdit() { return pendingEdit; }, set pendingEdit(v) { pendingEdit = v; } });

  const { Caja } = createChatComposer(props, { CampoDeLaCaja, MenuDeSugerencias, PermisoDeLaCaja, PreguntaDeLaCaja, actual, attachmentFailure, bloqueoDeSuperficie, cambiarModo, carpetaDeTerminal, efforts, elegido, elegirArchivos, entradaActiva, faltaUnanime, fuentes, listo, mandar, menuOpen, modoAlMargen, modoTerminal, opciones, preguntaPendiente, preguntaPlegada, presentation, pulsoDeModo, setSoltadoDe, trigger, get campo() { return campo; }, set campo(v) { campo = v; }, get composerBox() { return composerBox; }, set composerBox(v) { composerBox = v; }, get entradaArchivo() { return entradaArchivo; }, set entradaArchivo(v) { entradaArchivo = v; } });

  const { filaDeUsuario } = createChatUserRow(props, { claveFila, commandNames, copiado, copiando, copiarMensaje, presentation, skillNames });

  const { filaDelHilo } = createChatThreadRow(props, { abrirFork, activityBlocked, bloques, claveFila, copiado, copiando, copiarMensaje, esElVivo, esLaTiraViva, filaDeUsuario, forkeando, handoffStarting, hiloVirtual, isCurrentActivity, origen, pieDeTerminal, preguntasPlegadas, registroCorre, respondido, respuestaRapida, setPreguntasPlegadas, setTrabajos, shownFrom, trabajos, ultimoEscrito, visualBudget, volverAReciente });

  const { CabeceraDelEncargado, CapaDeLaCaja, DialogoDeContinuacion, HiloConScroll } = createChatViewParts(props, { Caja, altoDeLaCaja, altoEstimado, bloques, cajaDelHilo, cajaVirtual, centrada, chunks, clavesDelHilo, filaDelHilo, filasRetenidas, forkAgentChoice, forkDesde, forkTurn, forkeando, hilo, hiloDeFilasListo, hiloVirtual, inputsDelHilo, margenDelHilo, medirCaja, mensajeVisto, origen, preguntaPendiente, presentation, rielVisible, saltarALaLectura, saltarAlMensaje, saludo, setForkAgentChoice, setForkTurn, setPrimeraFila, tomarHilo, vacia, watchOlder, get elContenido() { return elContenido; }, set elContenido(v) { elContenido = v; }, get hiloDeFilas() { return hiloDeFilas; }, set hiloDeFilas(v) { hiloDeFilas = v; } });

  return (
    <FileMachine.Provider value={() => props.machine}>
    <WorkFace.Provider value={() => props.workAgent ? { name: props.workAgent, body: props.chatBody, avatar: props.chatAvatar } : null}>
      <DialogoDeContinuacion />
      {/* Mide la caja de la conversación: el padre es su ventana del reparto. */}
      <span ref={ancla} class="hidden" aria-hidden="true" />
      {/* El velo cubre solo esta conversación, la que recibe al soltar. Va fijo con
          la medida de su caja: el padre no siempre es `relative`. Sin
          `pointer-events`: un nodo capturando el puntero estorbaría al `leave`. */}
      <Show when={!props.soloLectura && soltando()}>
        {(caja) => (
        <div
          class="pointer-events-none fixed z-50 grid place-items-center rounded-md bg-black/40 p-6"
          style={{ left: `${caja().left}px`, top: `${caja().top}px`, width: `${caja().width}px`, height: `${caja().height}px` }}
          aria-hidden="true"
        >
          <div class="flex items-center gap-2 rounded-lg border-2 border-dashed border-primary bg-surface px-4 py-3 shadow-lg">
            <FileText size={16} class="shrink-0 text-primary" />
            <span class="text-sm font-medium">{t("chat.drop.hint")}</span>
          </div>
        </div>
        )}
      </Show>

    {/* El esqueleto se pinta contra la caja (`justify-end`), donde va a
        estar el final del hilo: lo que se sustituye ocupa el mismo sitio.
        Sin barra de scroll (`overflow-hidden`) y sin rótulo: el esqueleto
        ya trae su forma y su `aria-busy` (`ui/Skeleton.tsx`). */}
    <Show
      when={!props.cargando || props.msgs.length > 0 || Boolean(props.activities?.length)}
      fallback={
        <>
          <div class={cn("min-h-0 flex-1 overflow-hidden", margenDelHilo)}>
            {/* El armazón está siempre —es lo que reserva el sitio de la caja y
                del final del hilo—; lo que espera al umbral son las barras.
                Ver `UMBRAL_DEL_ESQUELETO_MS`: por debajo, dibujarlas es meter
                una forma que se va antes de que la veas. */}
            <div
              class={cn(
                "mx-auto flex h-full w-full flex-col justify-end gap-6",
                "max-w-[860px]",
              )}
            >
              <Show when={esperaVisible()}>
                <Skeleton class="ml-auto h-9 w-[40%] rounded-lg" />
                <Skeleton filas={4} class="h-4 rounded-sm" />
                <Skeleton class="ml-auto h-9 w-[28%] rounded-lg" />
                <Skeleton filas={2} class="h-4 rounded-sm" />
              </Show>
            </div>
          </div>
          <div
            class="flex shrink-0 flex-col items-center px-4 pt-1 pb-3"
          >
            <Show when={props.recovery} fallback={<Caja />}>{props.recovery}</Show>
          </div>
        </>
      }
    >
      {/* El overlay de soltar solo se pinta aquí — las rutas no salen de
          él, el `drop` de HTML5 entrega un `File` sin ruta en disco y el
          estado lo maneja `onDragDropEvent` (arriba). Tres niveles: el de
          fuera es el marco del botón de bajar, el de en medio es el que
          scrollea, el de dentro es lo único medible —tiene el alto de su
          hueco y no cambia—. `lib/paste.ts`. */}
      <div class="relative flex min-h-0 flex-1 flex-col">
      <Show when={props.masRecientes}><Pressable class="shrink-0 py-2 text-xs text-primary underline" onClick={volverAReciente}>{t("chat.history.latest")}</Pressable></Show>
      {props.coordinator}
      <CabeceraDelEncargado />
      <HiloConScroll />

      <Show when={props.estadoAntiguos === "loading" || props.estadoAntiguos === "failed"}>
        <div class="absolute top-2 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-surface-raised px-3 py-1 text-xs shadow-sm" role={props.estadoAntiguos === "failed" ? "alert" : "status"}>
          <Show when={props.estadoAntiguos === "failed"} fallback={t("chat.history.older_loading")}>
            {t("chat.history.older_failed")}{" "}
            <Pressable class="text-primary underline" onClick={() => void pedirAntiguos()}>{t("chat.history.older_retry")}</Pressable>
          </Show>
        </div>
      </Show>

      {/* El botón solo existe mientras haga falta —si el final ya se ve,
          no hay nada que ofrecer—; `alFondo` cubre también «estás cerca»
          para no parpadear a los veinte píxeles. Un control único cambia
          de rótulo en vez de dos que se turnarían el sitio, y ese rótulo
          es el nombre accesible: sin `aria-label` aparte no hay dos textos
          que revisar. Lo que no es respuesta no cuenta: «0 nuevos» mentiría. */}
      <Show when={!hilo.alFondo()}>
        {(() => {
          const rotulo = () =>
            mensajesNuevos() > 0
              ? t("chat.thread.new_messages", { count: mensajesNuevos() })
              : t("chat.thread.to_bottom");
          return (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => hilo.bajar()}
              title={rotulo()}
              // Por encima de la caja flotante y no a 12 px del fondo, que es
              // donde estaba cuando la caja ocupaba su propio bloque: ahí
              // quedaría detrás de ella, visible a medias y sin poder pulsarse.
              style={{ bottom: `${altoDeLaCaja() + 12}px` }}
              class="absolute left-1/2 z-30 -translate-x-1/2 rounded-full pr-2.5 pl-3 shadow-md"
            >
              <span class="whitespace-nowrap">{rotulo()}</span>
              <ArrowDown size={14} aria-hidden="true" class="shrink-0" />
            </Button>
          );
        })()}
      </Show>

      {/* La caja flota sobre el hilo, no debajo: el hueco
          medido desde arriba es lo que mantiene legible la última línea,
          no un hueco supuesto ni un degradado. La capa ocupa la celda
          entera para contener preguntas altas, pero solo su caja recibe
          puntero. Una pregunta pendiente no desaparece con otra ventana
          activa: la propia tarjeta activa su ventana al interactuar. */}
      <CapaDeLaCaja />
      </div>
    </Show>
    </WorkFace.Provider>
    </FileMachine.Provider>
  );
}
