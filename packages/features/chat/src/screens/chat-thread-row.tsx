import { t } from "../../../../ui/src/lib/i18n";
import { formatearDuracion } from "../../../../ui/src/lib/steps";
import { Markdown } from "../../../../ui/src/Markdown";
import { Pressable } from "../../../../ui/src/Pressable";
import SalidaDeComando from "../components/CommandOutput";
import Entrega from "../components/Delivery";
import RegistroPreguntas from "../components/QuestionLog";
import TarjetaDeTerminal from "../components/ShellCard";
import EstadoDelTurno from "../components/TurnStatus";
import { RegistroDeTrabajo } from "./activity/TurnActivity";
import { CambioDeContexto } from "../components/thread/MessageDecorations";
import { handoffStatus } from "./thread/PendingHandoff";
import { Interrupcion, LineaDeSistema, SiguioTrasElCupo, TraspasoDeProveedor } from "../components/thread/SystemMarkers";
import { observedActivityAction } from "../model/activityPresentation";
import { esFilaDeLaBandeja } from "../model/inboxRows";
import { claseDeSalida, comandoDe, esSalidaDeComando } from "../model/slashOutput";
import { chunkStart } from "../model/threadWindow";
import { RespuestasDeAvance, TrabajoDeAgente } from "./chat-agent-work";
import type { createChatAttachments } from "./chat-attachments";
import type { createChatBlocks } from "./chat-blocks";
import type { createChatComposerState } from "./chat-composer-state";
import { SIN_AVANCE, SIN_MENSAJE, activitySteps, claveDeTrabajo, esInterrupcion, fromWork, mensajeDe, pasosDe, trabajoDe, type Bloque } from "./chat-model";
import type { ChatProps } from "./chat-props";
import { FilaDeLaBandeja, HitoDelHilo } from "./chat-thread-markers";
import type { createChatThreadWindow } from "./chat-thread-window";
import type { createChatTurnState } from "./chat-turn-state";
import type { createChatUserRow } from "./chat-user-row";
import { Index, Match, Show, Switch } from "solid-js";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatThreadRowDeps = { abrirFork: ReturnType<typeof createChatAttachments>["abrirFork"]; activityBlocked: ReturnType<typeof createChatBlocks>["activityBlocked"]; bloques: ReturnType<typeof createChatBlocks>["bloques"]; claveFila: ReturnType<typeof createChatBlocks>["claveFila"]; copiado: ReturnType<typeof createChatComposerState>["copiado"]; copiando: ReturnType<typeof createChatComposerState>["copiando"]; copiarMensaje: ReturnType<typeof createChatAttachments>["copiarMensaje"]; esElVivo: ReturnType<typeof createChatComposerState>["esElVivo"]; esLaTiraViva: ReturnType<typeof createChatBlocks>["esLaTiraViva"]; filaDeUsuario: ReturnType<typeof createChatUserRow>["filaDeUsuario"]; forkeando: ReturnType<typeof createChatComposerState>["forkeando"]; handoffStarting: ReturnType<typeof createChatBlocks>["handoffStarting"]; hiloVirtual: ReturnType<typeof createChatThreadWindow>["hiloVirtual"]; isCurrentActivity: ReturnType<typeof createChatBlocks>["isCurrentActivity"]; origen: ReturnType<typeof createChatThreadWindow>["origen"]; pieDeTerminal: ReturnType<typeof createChatTurnState>["pieDeTerminal"]; preguntasPlegadas: ReturnType<typeof createChatComposerState>["preguntasPlegadas"]; registroCorre: ReturnType<typeof createChatBlocks>["registroCorre"]; respondido: ReturnType<typeof createChatTurnState>["respondido"]; respuestaRapida: ReturnType<typeof createChatComposerState>["respuestaRapida"]; setPreguntasPlegadas: ReturnType<typeof createChatComposerState>["setPreguntasPlegadas"]; setTrabajos: ReturnType<typeof createChatComposerState>["setTrabajos"]; shownFrom: ReturnType<typeof createChatThreadWindow>["shownFrom"]; trabajos: ReturnType<typeof createChatComposerState>["trabajos"]; ultimoEscrito: ReturnType<typeof createChatAttachments>["ultimoEscrito"]; visualBudget: ReturnType<typeof createChatComposerState>["visualBudget"]; volverAReciente: ReturnType<typeof createChatThreadWindow>["volverAReciente"] };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatThreadRow(props: ChatProps, deps: ChatThreadRowDeps) {
  const { abrirFork, activityBlocked, bloques, claveFila, copiado, copiando, copiarMensaje, esElVivo, esLaTiraViva, filaDeUsuario, forkeando, handoffStarting, hiloVirtual, isCurrentActivity, origen, pieDeTerminal, preguntasPlegadas, registroCorre, respondido, respuestaRapida, setPreguntasPlegadas, setTrabajos, shownFrom, trabajos, ultimoEscrito, visualBudget, volverAReciente } = deps;
  const filaDelHilo = (bloque: () => Bloque, indice: () => number) => {
              const b = () => bloque();
              const mensaje = () => mensajeDe(b());
              const startsLaunchGroup = () => {
                const index = indice();
                if (index === (hiloVirtual ? 0 : chunkStart(shownFrom(), origen()))) return true;
                const previous = bloques()[index - 1];
                return previous?.tipo !== "msg" || previous.msg.meta !== "task_launched" || !previous.msg.fromTask;
              };
              return (
              <Switch>
                <Match when={b().activity}>
                  <div class="col-start-1 min-w-0" data-turn-activity-anchor={b().activity?.key}>
                    <RegistroDeTrabajo
                      observed
                      outcome={b().activity?.outcome}
                      messages={b().activity?.messages}
                      stopping={Boolean(b().activity?.active) && props.stopping}
                      latestAction={observedActivityAction(b().activity?.observation?.message, b().activity?.observation?.kind) ?? (b().activity?.startConfirmed ? { kind: "thinking" } : null)}
                      pasos={activitySteps(b().activity)}
                      razonamiento={b().activity?.messages.flatMap(message => message.razonamiento ?? []) ?? []}
                      corriendo={Boolean(b().activity?.active)}
                      blocked={isCurrentActivity(b().activity) && activityBlocked()}
                      animando={Boolean(b().activity?.startConfirmed || !(b().activity?.startedAt === null && b().activity?.messages.length === 0)) && !props.permission && !props.esperando && !props.reintento && !props.enFondo && !props.machineWait}
                      duracion={b().activity?.durationMs == null ? null : formatearDuracion(b().activity!.durationMs!)}
                      abierto={Boolean(trabajos()[`activity:${b().activity?.key ?? ""}`])}
                      onAlternar={(open) => setTrabajos({ ...trabajos(), [`activity:${b().activity?.key ?? ""}`]: open })}
                      onVerCambios={props.onVerCambios}
                      status={() => <Show when={b().activity?.active && handoffStarting() && props.handoff} fallback={<Show when={b().activity?.active || (b().activity?.key === props.activities?.at(-1)?.key && (props.esperando || props.reintento || props.enFondo || props.machineWait))}><Show when={props.permission} fallback={<EstadoDelTurno inline desde={b().activity?.startedAt ?? null} paso={null} esperando={props.esperando} reintento={props.reintento} enFondo={props.enFondo ?? false} machineWait={props.machineWait} />}><span class="text-neutral-500">{t("chat.permission.title")}</span></Show></Show>}><span class="text-neutral-500">{props.handoff ? handoffStatus(props.handoff) : ""}</span></Show>}
                    />
                  </div>
                </Match>
                <Match when={mensaje()?.msg.meta === "history_gap"}>
                  <div class="col-start-1 min-w-0 py-1 text-center text-xs text-neutral-500" data-history-gap>
                    {t("chat.history.gap")}{" "}
                    <Pressable class="text-primary underline" onClick={volverAReciente}>{t("chat.history.latest")}</Pressable>
                  </div>
                </Match>
                <Match when={trabajoDe(b())}>
                  {(trabajo) => (
                    <TrabajoDeAgente
                      route={props.machineOf}
                      searchBlock={indice()}
                      responseOnly={b().responseOnly}
                      visualBudget={visualBudget}
                      visualScope={props.visualScope}
                      readVisual={props.readVisual}
                      openVisual={props.openVisual}
                      pasos={fromWork(b(), (t) => t.pasos, [])}
                      avance={fromWork(b(), (t) => t.avance ?? SIN_AVANCE, SIN_AVANCE)}
                      msg={fromWork(b(), (t) => t.msg, SIN_MENSAJE)}
                      respuestas={(msg) => msg.turno ? respondido().get(msg.turno) ?? null : null}
                      vivo={fromWork(b(), (t) => esElVivo(t.msg), false)}
                      stopping={props.stopping && registroCorre(b())}
                      corriendo={registroCorre(b())}
                      animando={!props.permission && !props.esperando && !props.reintento && !props.enFondo && !props.machineWait}
                      abiertoElTrabajo={Boolean(trabajos()[claveFila(b())])}
                      onAlternarTrabajo={() => {
                        const k = claveFila(trabajo());
                        setTrabajos({ ...trabajos(), [k]: !trabajos()[k] });
                      }}
                      preguntasAbiertas={(msg) => !preguntasPlegadas()[claveDeTrabajo(msg)]}
                      onAlternarPreguntas={(msg) => {
                        const k = claveDeTrabajo(msg);
                        setPreguntasPlegadas({
                          ...preguntasPlegadas(),
                          [k]: !preguntasPlegadas()[k],
                        });
                      }}
                      onVerCambios={props.onVerCambios}
                      agenteDelTurno={fromWork(b(), (t) => t.msg.agent ?? props.agent, props.agent)}
                      catalogo={props.catalogos[fromWork(b(), (t) => t.msg.agent ?? props.agent, props.agent)] ?? null}
                      agentLabel={
                        props.agents.find((a) => a.id === fromWork(b(), (t) => t.msg.agent ?? props.agent, props.agent))?.label
                          ?? fromWork(b(), (t) => t.msg.agent ?? props.agent, props.agent)
                      }
                      onCopiar={copiarMensaje}
                      copiando={fromWork(b(), (t) => copiando() === t.msg.turno, false)}
                      copiado={fromWork(b(), (t) => copiado() === t.msg.turno, false)}
                      onFork={props.onForkDesde ? async (turno) => { abrirFork(turno); } : null}
                      forkeando={fromWork(b(), (t) => forkeando() === t.msg.turno, false)}
                      forkDeshabilitado={forkeando() !== null}
                      rapida={respuestaRapida(fromWork(b(), (t) => t.i, 0))}
                    />
                  )}
                </Match>

                <Match when={pasosDe(b())}>
                  {(bp) => (
                    <div class="col-start-1 min-w-0" data-sender="system">
                    {/* Corre solo la tira del final con la tarea contestando:
                        un aviso que llegó con el turno cerrado no es trabajo. */}
                    <RegistroDeTrabajo
                      pasos={pasosDe(b())?.pasos ?? []}
                      avance={pasosDe(b())?.avance}
                      outcome={b().failedBeforeError ? "failed" : undefined}
                      stopping={props.stopping && esLaTiraViva(b())}
                      corriendo={esLaTiraViva(b())}
                      animando={!props.permission && !props.esperando && !props.reintento && !props.enFondo && !props.machineWait}
                      abierto={trabajos()[claveFila(b())]}
                      onAlternar={(abierto) => {
                        setTrabajos({ ...trabajos(), [claveFila(bp())]: abierto });
                      }}
                    />
                    <div data-thread-search-text={indice()}><RespuestasDeAvance route={props.machineOf} avance={pasosDe(b())?.avance ?? SIN_AVANCE} visualBudget={visualBudget} visualScope={props.visualScope} readVisual={props.readVisual} openVisual={props.openVisual} /></div>
                    <Index each={(pasosDe(b())?.avance ?? SIN_AVANCE).map(chunk => chunk.msg).filter(message => message.preguntas?.length)}>{(message) => <RegistroPreguntas items={message().preguntas!} respuestas={message().turno ? respondido().get(message().turno!) ?? null : null} abierta={!preguntasPlegadas()[claveDeTrabajo(message())]} onAlternar={() => { const key = claveDeTrabajo(message()); setPreguntasPlegadas({ ...preguntasPlegadas(), [key]: !preguntasPlegadas()[key] }); }} />}</Index>
                    </div>
                  )}
                </Match>

                <Match when={mensaje()?.msg.meta === "task_launched" ? mensaje()?.msg.fromTask : null}>
                  {reference => <div class="col-start-1 min-w-0">
                    <Show when={startsLaunchGroup()}>
                      <h3 class="mb-2 text-xs font-medium text-neutral-500">{t("chat.delegation.created")}</h3>
                    </Show>
                    {props.delegatedTask?.(reference())}
                  </div>}
                </Match>
                <Match when={mensaje()?.msg.contexto ?? null}>
                  {(cambio) => (
                    <div class="col-start-1 min-w-0">
                    <CambioDeContexto
                      cambio={cambio()}
                      catalogo={props.catalogo}
                    />
                    </div>
                  )}
                </Match>

                <Match
                  when={
                    mensaje()?.msg.artefactos?.length
                      ? mensaje()!.msg.artefactos
                      : null
                  }
                >
                  {(items) => (
                    <div class="col-start-1 min-w-0">
                    <Entrega items={items()} onAbrir={props.onAbrirArtefacto} />
                    </div>
                  )}
                </Match>

                <Match when={mensaje() && esInterrupcion(mensaje()!.msg)}>
                  <Interrupcion />
                </Match>

                <Match when={mensaje()?.msg.meta === "cupo" ? mensaje()!.msg : null}>
                  {(m) => <SiguioTrasElCupo cambio={m().quota ?? {}} />}
                </Match>

                <Match when={mensaje()?.msg.meta === "engine_updated"}>
                  <LineaDeSistema texto={t("chat.engine_updated")} />
                </Match>

                <Match when={mensaje()?.msg.meta === "provider_handover" ? mensaje()!.msg : null}>
                  {(m) => <TraspasoDeProveedor texto={m().text} />}
                </Match>

                <Match when={mensaje() && esFilaDeLaBandeja(mensaje()!.msg.meta) ? mensaje()!.msg : null}>
                  {(m) => <FilaDeLaBandeja msg={m()} onOpenTask={props.onOpenTask} tareaPorId={props.tareaPorId} />}
                </Match>

                <Match when={esSalidaDeComando(mensaje()?.msg.meta)}>
                  {/* Lee `mensaje()` y no el accesor del `Match`: estas props
                      leen también `props.msgs`. */}
                  <SalidaDeComando
                    text={mensaje()?.msg.text ?? ""}
                    command={comandoDe(props.msgs, mensaje()?.i ?? 0)}
                    agent={mensaje()?.msg.agent ?? props.agent}
                    agentLabel={
                      props.agents.find((a) => a.id === (mensaje()?.msg.agent ?? props.agent))?.label
                        ?? mensaje()?.msg.agent
                        ?? props.agent
                    }
                    clase={claseDeSalida(mensaje()?.msg.meta)}
                    durationMs={mensaje()?.msg.duration_ms}
                  />
                </Match>

                <Match when={mensaje()?.msg.shell ? mensaje()!.msg : null}>
                  {(m) => (
                    <TarjetaDeTerminal
                      command={m().text}
                      cwd={m().shell!.cwd}
                      output={m().shell!.output}
                      truncated={m().shell!.truncated}
                      exitCode={m().shell!.exit_code}
                      durationMs={m().shell!.duration_ms ?? null}
                      pendiente={m().shell!.exit_code !== null ? pieDeTerminal(mensaje()?.i ?? 0) : null}
                    />
                  )}
                </Match>

                <Match
                  when={
                    mensaje()?.msg.role === "system" && !esInterrupcion(mensaje()!.msg)
                      ? mensaje()!.msg
                      : null
                  }
                >
                  {(m) => (
                    <HitoDelHilo
                      msg={m()}
                      vigente={(mensaje()?.i ?? -1) > ultimoEscrito()}
                      onReintentar={props.onReintentar}
                      onCuentas={props.onConectar}
                      onOpenTask={props.onOpenTask}
                    />
                  )}
                </Match>

                <Match when={mensaje()?.msg.role === "user" ? mensaje()!.msg : null}>
                  {(m) => filaDeUsuario(m, b, indice)}
                </Match>

                <Match when={mensaje()}>
                  {(bm) => (
                    <article class="col-start-1 min-w-0 max-w-full">
                      <Markdown>{bm().msg.text}</Markdown>
                      <Show
                        when={props.busy && mensajeDe(b())?.i === props.msgs.length - 1}
                      >
                        <span
                          class="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-primary animate-danil-pulse"
                          aria-hidden="true"
                        />
                      </Show>
                    </article>
                  )}
                </Match>
              </Switch>
              );
  };
  return { filaDelHilo };
}
