import { HistoryDetails } from "../components/HistoryDetails";
import Split from "lucide-solid/icons/split";
import { Index, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { AgentModels } from "../../../../../apps/desktop/src/lib/model";
import type { MachineOf } from "../queries/history-details";
import { formatearDuracion, type Paso } from "../../../../../apps/desktop/src/lib/steps";
import { cn } from "../../../../ui/src/lib/utils";
import { Button } from "../../../../ui/src/Button";
import { type VisualBudget } from "../model/visualBudget";
import { stripNextSteps } from "../../../../ui/src/lib/chat/nextSteps";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../../../ui/src/Tooltip";
import { AltoMonotono } from "../components/MonotonicHeight";
import RegistroPreguntas from "../components/QuestionLog";
import { type Respuesta } from "../components/Questions";
import { HoraDelTurno, LineaDeProveedor, BotonCopiar } from "../components/thread/MessageDecorations";
import { TextoConSiguientes, ImagenesEntregadas, type RespuestaRapida } from "../components/thread/AgentAnswer";
import type { Msg } from "../model/messageTypes";
import { RegistroDeTrabajo } from "../components/activity/TurnActivity";
import { type Avance, textoVisible, FILA_DEL_MENSAJE } from "./chat-model";


/** Native stream messages have no semantic phase: their responses never enter the activity fold. */
function RespuestasDeAvance(props: { route: MachineOf; avance: Avance[]; visualBudget: VisualBudget; visualScope?: string; readVisual?: (file: string) => Promise<string>; openVisual?: (file: string) => Promise<void> }) {
  return <Index each={props.avance.filter(chunk => chunk.outside)}>{(chunk) => <>
    <Show when={textoVisible(chunk().msg.text)}>{(text) => <TextoConSiguientes texto={text()} vivo={false} rapida={null} readVisual={props.readVisual} openVisual={props.openVisual} owner={props.visualScope ?? ""} visualBudget={props.visualBudget} />}</Show>
    <Show when={chunk().msg.historyRefs?.length}><HistoryDetails refs={chunk().msg.historyRefs!} turnId={chunk().msg.turno} route={props.route} renderText={(text) => <TextoConSiguientes texto={text} vivo={false} rapida={null} readVisual={props.readVisual} openVisual={props.openVisual} owner={props.visualScope ?? ""} visualBudget={props.visualBudget} />} /></Show>
    <Show when={chunk().msg.images?.length ? chunk().msg.images : null}>{(images) => <ImagenesEntregadas items={images()} />}</Show>
  </>}</Index>;
}

function TrabajoDeAgente(props: {
  route: MachineOf;
  visualBudget: VisualBudget;
  visualScope?: string;
  readVisual?: (file: string) => Promise<string>;
  openVisual?: (file: string) => Promise<void>;
  searchBlock?: number;
  responseOnly?: boolean;
  pasos: Paso[];
  avance: Avance[];
  msg: Msg;
  respuestas: (msg: Msg) => Respuesta[] | null;
  /** Si este turno es el que está corriendo ahora mismo. */
  vivo: boolean;
  /** El estado del turno manda incluso si falta el cierre de una herramienta. */
  corriendo: boolean;
  stopping?: boolean;
  animando: boolean;
  /** Si ESTE turno tiene su registro desplegado. Ver `trabajos` en `Chat`. */
  abiertoElTrabajo: boolean;
  onAlternarTrabajo: () => void;
  /** Si las preguntas de ESTE turno están desplegadas. Nacen abiertas. */
  preguntasAbiertas: (msg: Msg) => boolean;
  onAlternarPreguntas: (msg: Msg) => void;
  /** Solo se ofrece si el turno trae rango de código (`msg.code`). */
  onVerCambios?: () => void;
  /** El agente dueño del turno, cuando el mensaje no lo trae. */
  agenteDelTurno: string;
  /** El nombre legible del agente, para el tooltip cuando no hay proveedor. */
  agentLabel: string;
  /** El catálogo de ese agente: de él sale el nombre con versión del modelo. */
  catalogo: AgentModels | null;

  onCopiar: (turno: string, texto: string) => Promise<void>;
  copiando: boolean;
  copiado: boolean;

  onFork: ((turno: string) => Promise<void>) | null;
  forkeando: boolean;

  forkDeshabilitado: boolean;
  /** `null` si esta conversación no puede mandar respuestas rápidas. */
  rapida: RespuestaRapida | null;
}) {
  /**
   * Las preguntas no cuentan aquí: son un bloque hermano, y contándolas
   * un turno que solo preguntó —sin un paso ni duración— abriría un
   * «Trabajo» que al desplegarse no enseña nada.
   */
  const tieneRegistro = () => !props.responseOnly && (
    props.pasos.length > 0 || props.avance.length > 0 || Boolean(props.msg.razonamiento?.length) || props.corriendo || props.msg.duration_ms !== undefined);
  const duracion = () =>
    props.msg.duration_ms === undefined
      ? null
      : formatearDuracion(props.msg.duration_ms);
  const texto = () => textoVisible(props.msg.text);
  return (
    <article class="group/mensaje col-start-1 min-w-0 max-w-full">
      <Show when={tieneRegistro()}>
        <RegistroDeTrabajo
          pasos={props.pasos}
          avance={props.avance}
          stopping={props.stopping}
          corriendo={props.corriendo}
          duracion={duracion()}
          abierto={props.abiertoElTrabajo}
          onAlternar={props.onAlternarTrabajo}
          razonamiento={props.msg.razonamiento}
          animando={props.animando}
          onVerCambios={props.msg.code?.length ? props.onVerCambios : undefined}
        />
      </Show>

      {/* Entre el registro y la respuesta, que es donde ocurrió: el
          agente preguntó a mitad del turno, por debajo de lo que hizo
          hasta entonces y por encima de lo que contestó con la respuesta
          ya en la mano. Fuera del pliegue — ver la cabecera de
          `RegistroPreguntas`. */}
      <Index each={[...props.avance.map(chunk => chunk.msg), props.msg].filter(message => message.preguntas?.length)}>
        {(message) => <RegistroPreguntas
          items={message().preguntas!}
          respuestas={props.respuestas(message())}
          abierta={props.preguntasAbiertas(message())}
          onAlternar={() => props.onAlternarPreguntas(message())}
        />}
      </Index>

      {/* Envuelto para que no encoja mientras el turno vive. El markdown
          se reparsea con cada token: una negrita sin cerrar se pinta
          literal, y cerrada se pinta en negrita, cambiando el alto de
          forma no monótona y encogiendo el bloque. Con el hilo pegado al
          final eso es el temblor. `lib/paste.ts` fija la última línea al
          borde y no cubre este caso. Ver `ui/MonotonicHeight.tsx`. */}
      {/* La identidad del turno —logo, proveedor y modelo— vive en la fila de
          acciones, con la hora y los botones, y solo al posar. Antes firmaba la
          respuesta con un renglón encima; ahí competía con el texto y nombraba
          al encargado del hilo, que ya lo dice la cabecera. */}
      <div data-thread-search-text={props.searchBlock}>
      <RespuestasDeAvance route={props.route} avance={props.avance} visualBudget={props.visualBudget} visualScope={props.visualScope} readVisual={props.readVisual} openVisual={props.openVisual} />
      <Show when={texto()}>
        {(md) => (
          <AltoMonotono vivo={props.vivo}>
            <TextoConSiguientes texto={md()} vivo={props.vivo} rapida={props.rapida} readVisual={props.readVisual} openVisual={props.openVisual} owner={props.visualScope ?? ""} visualBudget={props.visualBudget} />
          </AltoMonotono>
        )}
      </Show>

      </div>
      <Show when={props.msg.historyRefs?.length}><HistoryDetails refs={props.msg.historyRefs!} turnId={props.msg.turno} route={props.route} renderText={(text) => <TextoConSiguientes texto={text} vivo={props.vivo} rapida={props.rapida} readVisual={props.readVisual} openVisual={props.openVisual} owner={props.visualScope ?? ""} visualBudget={props.visualBudget} />} /></Show>
      <Show when={props.msg.images?.length ? props.msg.images : null}>
        {(images) => <ImagenesEntregadas items={images()} />}
      </Show>


      <div class={cn(FILA_DEL_MENSAJE, "-ml-1.5")}>
        <Show when={texto()}>
          {(md) => (
            <BotonCopiar
              copiando={props.copiando}
              copiado={props.copiado}
              onCopiar={() => void props.onCopiar(props.msg.turno ?? "", stripNextSteps(md()))}
            />
          )}
        </Show>
        <Show when={props.onFork && props.msg.turno}>
          <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="top">
            <TooltipTrigger
              as={(p: object) => (
                <Button
                  {...p}
                  type="button"
                  variant="ghost"
                  size="iconCompact"
                  class="text-neutral-500"
                  disabled={props.forkeando || props.forkDeshabilitado}
                  aria-label={t("chat.actions.fork")}
                  onClick={(e: MouseEvent) => {
                    (p as { onClick?: (e: MouseEvent) => void }).onClick?.(e);
                    void props.onFork!(props.msg.turno!);
                  }}
                >
                  <Split size={14} class="rotate-90" />
                </Button>
              )}
            />
            <TooltipContent class="whitespace-nowrap">
              {t("chat.actions.fork")}
            </TooltipContent>
          </TooltipRoot>
        </Show>
        <HoraDelTurno at={props.msg.at} />
        <LineaDeProveedor
          agent={props.msg.agent ?? props.agenteDelTurno}
          provider={props.msg.model_vendor}
          model={props.msg.reported_model}
          catalogo={props.catalogo}
          agentLabel={props.agentLabel}
        />
      </div>

    </article>
  );
}
export { RespuestasDeAvance, TrabajoDeAgente };
