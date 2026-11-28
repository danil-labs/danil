
import { connected } from "../../../../session/src/engineConnection.ts";
import { type Agent } from "../../../../ui/src/lib/model.ts";
import { esProvisional, tituloProvisional } from "../../../../ui/src/lib/taskDraft";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { claveDe } from "../../../../ui/src/Failure";
import { type Encolado } from "../components/MessageQueue";
import { mensajeDeFallo } from "../model/failures";
import { esDeLaTerminal, interrumpible, type RazonDeRetencion } from "../../../../ui/src/lib/queue.ts";
import { type ComandoQueNace, type Corrida, type TerminalLanzada } from "./sleepSession.ts";
import { batch, createEffect, createMemo, on, onCleanup, onMount, type Accessor, type Setter } from "solid-js";
import type { ComposerPort, DefaultPermissionModeChange, MachinesPort, ProjectsPort, SessionRow, WorkspaceContextPort, createThreadsStore } from "./types.ts";
import type { createTabs } from "../../../../ui/src/lib/tabs.ts";
import type { createPanelDeChat } from "../screens/PanelDeChat.tsx";
import type { createAttachmentsMount } from "./attachments-mount.ts";
import type { createAttachments } from "./attachments.ts";
import type { createHandover } from "./handover.ts";
import type { createResyncCommands } from "./resync-commands.ts";
import type { createSendNow } from "./send-now.ts";
import type { createSend } from "./send.ts";
import type { createThreadStream } from "./thread-stream.ts";


/** Lo que el bloque usaba del cuerpo de App. */
export type ShellCommandDeps = { DEFAULT_PERMISSION_MODE_EVENT: "harness:default-permission-mode"; adoptarNacida: ReturnType<typeof createHandover>["adoptarNacida"]; agent: Accessor<string>;
  agents: Accessor<Agent[]>; busy: ReturnType<typeof createThreadStream>["busy"]; carpetasDeTerminal: ReturnType<typeof createThreadStream>["carpetasDeTerminal"]; claveAbierta: () => string;
  cola: ReturnType<typeof createThreadStream>["cola"]; comandosDeLaCola: ReturnType<typeof createThreadStream>["comandosDeLaCola"]; composer: ComposerPort;
  configDeLaSesion: ReturnType<typeof createHandover>["configDeLaSesion"]; conversationScope: ReturnType<typeof createThreadStream>["conversationScope"];
  deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; detenerYEnviar: ReturnType<typeof createSendNow>["detenerYEnviar"];
  draftBases: Accessor<Record<string, string>>; draftMachine: () => string | null; draftOptions: () => { headers: { "x-terminus-machine": string; }; } | undefined; effort: Accessor<string>;
  enCache: Accessor<boolean>; engineCanDispatch: ReturnType<typeof createThreadStream>["engineCanDispatch"]; enviar: ReturnType<typeof createSend>["enviar"]; escritorio: Accessor<string | null>;
  esperando: Accessor<boolean>; grupos: Accessor<string[]>;
  hablandoCon: Accessor<{ project: string; name: string; } | null>; handoff: ReturnType<typeof createThreadStream>["handoff"]; handoffAt: ReturnType<typeof createThreadStream>["handoffAt"];
  injecting: ReturnType<typeof createThreadStream>["injecting"]; lanzados: ReturnType<typeof createThreadStream>["lanzados"]; lifecycleRevision: number;
  machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; machines: MachinesPort;
  marcarQuieta: ReturnType<typeof createThreadStream>["marcarQuieta"]; marcarViva: ReturnType<typeof createThreadStream>["marcarViva"]; model: Accessor<string>; modo: Accessor<string>;
  nacenConComando: ReturnType<typeof createThreadStream>["nacenConComando"]; olvidarPestana: ReturnType<typeof createPanelDeChat>["olvidarPestana"];
  pendingStarts: ReturnType<typeof createThreadStream>["pendingStarts"]; pestanas: ReturnType<typeof createTabs>; pintarNaciendo: ReturnType<typeof createHandover>["pintarNaciendo"];
  ponerTerminal: ReturnType<typeof createResyncCommands>["ponerTerminal"]; project: Accessor<string>; projectCatalog: ProjectsPort;
  quitarDeLaCola: ReturnType<typeof createResyncCommands>["quitarDeLaCola"]; reanudarCola: ReturnType<typeof createSendNow>["reanudarCola"];
  refreshFolder: ReturnType<typeof createAttachments>["refreshFolder"]; refreshSessions: (proyectos: string[]) => Promise<void>;
  retenidaPorElMotor: ReturnType<typeof createThreadStream>["retenidaPorElMotor"]; retirarNaciendo: (id: string) => { project: string; row: SessionRow; }[];
  sesiones: Accessor<Record<string, SessionRow[]>>; sessionId: Accessor<string | null>; setArrancando: ReturnType<typeof createThreadStream>["setArrancando"];
  setHablandoCon: Setter<{ project: string; name: string; } | null>; setInjecting: ReturnType<typeof createThreadStream>["setInjecting"];
  setPermissionError: ReturnType<typeof createThreadStream>["setPermissionError"]; setPorContestar: ReturnType<typeof createResyncCommands>["setPorContestar"]; setSessionId: Setter<string | null>;
  setTerminales: ReturnType<typeof createThreadStream>["setTerminales"]; settleTurn: ReturnType<typeof createAttachmentsMount>["settleTurn"];
  settlingTurns: ReturnType<typeof createThreadStream>["settlingTurns"]; soltarTerminal: ReturnType<typeof createResyncCommands>["soltarTerminal"];
  stopping: ReturnType<typeof createThreadStream>["stopping"]; taskQueues: ReturnType<typeof createThreadStream>["taskQueues"];
  taskSpaceCreate?: (requested: string | null | undefined) => { engineSpace: string | null; record: (taskId: string) => void };
  terminales: ReturnType<typeof createThreadStream>["terminales"];
  threads: ReturnType<typeof createThreadsStore>; vivas: ReturnType<typeof createThreadStream>["vivas"]; workspaceActivo: Accessor<string | null>;
  workspaceContext: WorkspaceContextPort; };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2961–3259, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createShellCommand(deps: ShellCommandDeps) {
  const { DEFAULT_PERMISSION_MODE_EVENT, agent, agents, busy, carpetasDeTerminal, claveAbierta, cola, comandosDeLaCola, composer, conversationScope, deLaTarea, draftBases, draftMachine, draftOptions, effort, enCache, engineCanDispatch, escritorio, esperando, grupos, hablandoCon, handoff, handoffAt, injecting, lanzados, machineOf, machines, marcarQuieta, marcarViva, model, modo, nacenConComando, pendingStarts, pestanas, ponerTerminal, project, projectCatalog, quitarDeLaCola, refreshFolder, refreshSessions, retenidaPorElMotor, retirarNaciendo, sesiones, sessionId, setArrancando, setHablandoCon, setInjecting, setPermissionError, setPorContestar, setSessionId, setTerminales, settleTurn, settlingTurns, soltarTerminal, stopping, taskQueues, taskSpaceCreate, terminales, threads, vivas, workspaceActivo, workspaceContext } = deps;
  const adoptarNacida: ShellCommandDeps["adoptarNacida"] = (...a: Parameters<ShellCommandDeps["adoptarNacida"]>) => deps.adoptarNacida(...a);
  const configDeLaSesion: ShellCommandDeps["configDeLaSesion"] = (...a: Parameters<ShellCommandDeps["configDeLaSesion"]>) => deps.configDeLaSesion(...a);
  const detenerYEnviar: ShellCommandDeps["detenerYEnviar"] = (...a: Parameters<ShellCommandDeps["detenerYEnviar"]>) => deps.detenerYEnviar(...a);
  const enviar: ShellCommandDeps["enviar"] = (...a: Parameters<ShellCommandDeps["enviar"]>) => deps.enviar(...a);
  const olvidarPestana: ShellCommandDeps["olvidarPestana"] = (...a: Parameters<ShellCommandDeps["olvidarPestana"]>) => deps.olvidarPestana(...a);
  const pintarNaciendo: ShellCommandDeps["pintarNaciendo"] = (...a: Parameters<ShellCommandDeps["pintarNaciendo"]>) => deps.pintarNaciendo(...a);
  const reanudarCola: ShellCommandDeps["reanudarCola"] = (...a: Parameters<ShellCommandDeps["reanudarCola"]>) => deps.reanudarCola(...a);
  /** El turno en que el agente contesta a la salida de la terminal, sin que nadie escriba. */
  async function contestarALaTerminal(session: string, lanzado: TerminalLanzada) {
    try {
      await abrirRespuestaALaTerminal(session, lanzado);
    } finally {
      setPorContestar((ss) => ss.filter((s) => s !== session));
    }
  }

  async function abrirRespuestaALaTerminal(session: string, lanzado: TerminalLanzada) {
    if (vivas().includes(session) || settlingTurns().includes(session)) return;
    pendingStarts.set(session, Symbol());
    marcarViva(session);
    try {
      const abrio = await callEngine<boolean>("answer_shell_output", {
        provider: lanzado.provider,
        project: lanzado.project,
        session,
        model: lanzado.model,
        effort: lanzado.effort,
        permissionMode: lanzado.permission_mode,
      }, deLaTarea(session));
      if (abrio) {
        threads.appendPersisted(session, [{ role: "system", text: "", meta: "shell_reply", agent: lanzado.provider }]);
        return;
      }
    } catch (error) {
      threads.appendLive(session, [{ role: "system", ...mensajeDeFallo(error), meta: "fallo" }]);
    }
    pendingStarts.delete(session);
    marcarQuieta(session);
  }

  /** Corre un `!` y devuelve el error, o `null` si corrió. */
  async function ejecutarComando(session: string, lanzado: TerminalLanzada, command: string, queueId: string | null) {
    lanzados.set(session, lanzado);
    pendingStarts.set(session, Symbol());
    // Sin id hasta `shell_started`: hasta entonces la tarea tampoco es del agente.
    batch(() => {
      marcarViva(session);
      ponerTerminal(session, {
        id: "",
        command: command.trim(),
        cwd: carpetasDeTerminal()[session] ?? null,
        output: "",
        truncated: false,
        desde: Date.now(),
      });
    });
    try {
      await callEngine<Corrida>("run_shell_command", { project: lanzado.project, session, command, queueId }, deLaTarea(session));
      return null;
    } catch (error) {
      if (lanzados.get(session) === lanzado) {
        lanzados.delete(session);
        pendingStarts.delete(session);
        if (!terminales()[session]?.id) {
          soltarTerminal(session);
          marcarQuieta(session);
        }
      }
      threads.appendLive(session, [{ role: "system", ...mensajeDeFallo(error), meta: "fallo" }]);
      return error;
    }
  }

  /** La tarea que abrió un `!` de esta ventana toma su fila, su pestaña y, si se sigue mirando, la vista. */
  function adoptarComando(runId: string, session: string) {
    const nace = nacenConComando.get(runId);
    if (!nace) return false;
    nacenConComando.delete(runId);
    nace.session = session;
    nace.recordSpace?.(session);
    nace.recordSpace = undefined;
    if (nace.generation !== workspaceContext.generation()) return true;
    lanzados.set(session, nace.lanzado);
    batch(() => {
      soltarTerminal("");
      setArrancando(false);
      adoptarNacida(session, { provisional: nace.provisional, proyecto: nace.lanzado.project, titulo: nace.titulo, claveBorrador: nace.claveBorrador });
      if (claveAbierta() !== nace.claveBorrador) return;
      setSessionId(session);
      setHablandoCon(null);
      taskQueues.adopt(session);
    });
    return true;
  }

  /** Corre un `!` escrito sin tarea: Rust la abre con lo que la caja tiene puesto. Dice si corrió. */
  async function abrirConComando(command: string): Promise<boolean> {
    const proyecto = project();
    const claveBorrador = claveAbierta();
    const encargado = hablandoCon()?.name ?? null;
    const lanzado = { project: proyecto, provider: agent(), model: model() || null, effort: effort() || null, permission_mode: modo() || null };
    const titulo = tituloProvisional(command);
    const runId = crypto.randomUUID();
    const spacePlan = taskSpaceCreate
      ? taskSpaceCreate(escritorio())
      : { engineSpace: escritorio(), record: () => {} };
    let provisional = "";
    batch(() => {
      setArrancando(true);
      ponerTerminal("", { id: "", command: command.trim(), cwd: null, output: "", truncated: false, desde: Date.now() });
      provisional = pintarNaciendo(proyecto, titulo, lanzado, encargado);
    });
    const nace: ComandoQueNace = {
      lanzado,
      provisional,
      titulo,
      claveBorrador,
      generation: workspaceContext.generation(),
      session: null,
      recordSpace: spacePlan.record,
    };
    nacenConComando.set(runId, nace);
    deps.lifecycleRevision++;
    try {
      const enOtra = draftOptions();
      const corrida = await callEngine<Corrida>("run_shell_command", {
        project: proyecto,
        session: null,
        command,
        queueId: null,
        provider: lanzado.provider,
        model: lanzado.model,
        effort: lanzado.effort,
        permissionMode: lanzado.permission_mode,
        space: spacePlan.engineSpace,
        agent: encargado,
        baseRef: draftBases()[claveBorrador] ?? null,
        runId,
      }, enOtra);
      nace.recordSpace?.(corrida.session);
      nace.recordSpace = undefined;
      // Sin su `shell_started` no hay nada pintado: se adopta aquí y se lee del disco.
      if (adoptarComando(runId, corrida.session) && nace.generation === workspaceContext.generation()) void settleTurn(corrida.session, true);
      return true;
    } catch (error) {
      // Tras arrancar, la tarea queda con el fallo escrito y llega al releerla.
      if (nace.session) return false;
      nacenConComando.delete(runId);
      batch(() => {
        soltarTerminal("");
        setArrancando(false);
        retirarNaciendo(nace.provisional);
        pestanas.close(nace.provisional);
        olvidarPestana(nace.provisional);
      });
      if (nace.generation !== workspaceContext.generation()) return false;
      // La frase de un modo que el agente no sostiene nombra al agente.
      const label = agents().find((a) => a.id === lanzado.provider)?.label ?? lanzado.provider;
      threads.appendLive("", [{ role: "system", ...mensajeDeFallo(error, { agent: label }), meta: "fallo" }]);
      return false;
    }
  }

  // Sale de la cola al arrancar (`shell_started`), no al terminar: mientras corre
  // ya se ve en su tarjeta.
  async function ejecutarDeLaCola(item: Encolado) {
    const abierta = sessionId();
    if (!abierta) return;
    setInjecting((items) => [...items, { session: abierta, id: item.id }]);
    comandosDeLaCola.set(abierta, item.id);
    const sesion = configDeLaSesion(abierta);
    const lanzado = {
      project: project(),
      provider: sesion.provider,
      model: sesion.model,
      effort: sesion.effort,
      permission_mode: item.permission_mode,
    };
    const error = await ejecutarComando(abierta, lanzado, item.text.trimStart().slice(1), item.id);
    if (comandosDeLaCola.get(abierta) === item.id) comandosDeLaCola.delete(abierta);
    setInjecting((items) => items.filter((q) => q.id !== item.id));
    const clave = error === null ? null : claveDe(error);
    if (error === null || clave === "chat.shell.not_queued" || clave === "chat.shell.not_from_person") quitarDeLaCola(abierta, item.id);
  }

  /** Le teclea al `!` en marcha de una tarea. La terminal no hace eco: lo pinta la ventana. */
  async function teclearAlComando(id: string | null | undefined, texto: string, eco: boolean): Promise<boolean> {
    const vivo = id ? terminales()[id] : null;
    if (!id || !vivo?.id) return false;
    try {
      if (!(await callEngine<boolean>("write_shell_input", { session: id, input: texto }, deLaTarea(id)))) return false;
    } catch (e) {
      threads.appendLive(id, [{ role: "system", ...mensajeDeFallo(e), meta: "fallo" }]);
      return false;
    }
    // Una tecla suelta (flecha, Enter de menú) no se pinta: la dibuja el propio programa.
    const tecla = texto.length <= 3 && !/^[^\u001b\r\t ]+\r$/.test(texto);
    const linea = tecla ? "" : texto.replace(/\u0004/g, "").replace(/\r$/, "\n");
    const pintado = eco ? linea : linea && "\n";
    if (pintado) {
      setTerminales((ts) => {
        const actual = ts[id];
        if (!actual || actual.id !== vivo.id) return ts;
        return { ...ts, [id]: { ...actual, output: actual.output + pintado } };
      });
    }
    return true;
  }

  async function detener() {
    const id = sessionId();
    if (!busy() || !id || stopping()) return;
    setPermissionError(null);
    const scope = conversationScope(id);
    const hadPending = Boolean(handoffAt(id)?.pending);
    const shell = Boolean(terminales()[id] || lanzados.has(id));
    const stopPromise = handoff.requestStop(scope);
    // Actúa al instante en el frente sin esperar el viaje al backend: quita `busy` y el spinner
    // de «Pensando… / Dándole vueltas…» de inmediato; `handoff` sigue cuidando la barrera con el motor.
    if (!hadPending && !shell) marcarQuieta(id, "interrupted");
    await stopPromise;
  }

  /**
   * Un elemento de la cola sale porque la persona lo pidió: una vez, con su id como
   * `clientMessageId` (otro en «Enviar de nuevo»), y deja la cola solo si el motor lo aceptó.
   */
  async function enviarDeLaCola(session: string, id: string, clientMessageId = id) {
    const scope = conversationScope(session);
    if (handoff.blocked(scope) || vivas().includes(session) || settlingTurns().includes(session)) return;
    const item = (session === sessionId() ? cola() : taskQueues.saved(session)?.items ?? []).find((q: { id: string }) => q.id === id);
    if (!item || injecting().some((q) => q.session === session && q.id === id)) return;
    handoff.observe({ kind: "dispatching", scope, itemIds: [id] });
    setInjecting((items) => [...items, { session, id }]);
    try {
      if (!(await enviar(item, undefined, session === sessionId() ? undefined : { project: scope.project, session }, undefined, clientMessageId))) return;
      taskQueues.remove(id, session);
      if (session !== sessionId()) void taskQueues.persist(session, scope.project, taskQueues.saved(session)?.items ?? []).catch(() => {});
    } catch {
      // `enviar` ya lo dijo en el hilo: el elemento se queda en la cola.
    } finally {
      setInjecting((items) => items.filter((q) => q.session !== session || q.id !== id));
    }
  }

  /** «Detener y enviar»: el elegido sale cuando el turno cerró y Detener tuvo recibo; con el motor, se lo suelta. */
  function mandarElegido(session: string) {
    const view = handoffAt(session), id = view?.pending?.queueItemId;
    if (!id || !view.released || view.error || view.pending?.phase !== "waiting-close" || vivas().includes(session) || settlingTurns().includes(session)) return;
    if (!engineCanDispatch(session)) return void enviarDeLaCola(session, id);
    handoff.observe({ kind: "dispatching", scope: conversationScope(session), itemIds: [id] });
    void reanudarCola(session);
  }

  /** «Enviar», un elemento por clic: con el turno vivo lo detiene y manda; un `!` lo corre aquí; con el motor, le suelta la cola. */
  function mandarCola() {
    const id = sessionId(), view = handoffAt(id);
    if (!id) return;
    const scope = conversationScope(id);
    const libres = cola().filter((item) => !item.uncertain && !injecting().some((q) => q.session === id && q.id === item.id));
    const next = libres.find(interrumpible), head = libres[0];
    if (busy()) { if (next) void detenerYEnviar(next.id); return; }
    if (view?.error && view.pending?.phase === "waiting-close") return void handoff.replaceWithQueued(scope, view.pending.queueItemId);
    if (handoff.blocked(scope) || (view?.pending && !view.error)) {
      if (next && !view?.pending) void handoff.replaceWithQueued(scope, next.id);
      return;
    }
    if (head && esDeLaTerminal(head)) void ejecutarDeLaCola(head);
    else if (engineCanDispatch(id)) void reanudarCola(id);
    else if (head) void enviarDeLaCola(id, head.id);
  }

  /** Por qué la cola no sale sola; `manual`: no se sabe si su motor la despacha (no anuncia el rasgo, o es la web). */
  function razonDeLaCola(): RazonDeRetencion | null {
    const id = sessionId(), head = cola().find((item) => !item.uncertain);
    if (esperando()) return "pregunta";
    if (!engineCanDispatch(id)) return "manual";
    if (retenidaPorElMotor()) return "motor";
    return head && esDeLaTerminal(head) && !busy() ? "terminal" : null;
  }

  // Al cerrar un turno se refresca el historial, y la carpeta: una tarea
  // recién nacida no pasó por `abrirSesion`, y sin carpeta la tarjeta de
  // entrega no tiene contra qué armar la ruta.
  createEffect(
    on([busy, sessionId], ([ocupado, id], antes) => {
      if (ocupado || !id) return;
      // Pasar de una tarea a otra no: `abrirSesion` ya lee su carpeta, y el
      // historial entero parsea cada `session.json` del workspace.
      const previa = antes?.[1];
      if (previa && previa !== id && !esProvisional(previa)) return;
      void refreshFolder(project(), id);
      void refreshSessions(grupos());
    }),
  );

  // Cambiar de tarea NO cierra la tercera columna: todo lo que enseña viene
  // por props derivadas de la tarea (`session()`) y se repinta sola.

  // El historial se recarga cuando cambia la lista de proyectos, no el activo.
  // Antes del motor no: el arranque reinicia las lecturas y las relee en `aplicar`.
  const confirmedSessionGroups = createMemo((previous: {
    scope: NonNullable<ReturnType<typeof projectCatalog.readyScope>>; groups: string[];
  } | null) => {
    const scope = projectCatalog.readyScope(), groups = grupos();
    if (!scope || !scope.workspace || scope.workspace !== workspaceActivo()) return null;
    return previous?.scope === scope && previous?.groups === groups ? previous : { scope, groups };
  }, null);
  createEffect(on(confirmedSessionGroups, (current) => {
    // Cached startup already reads its known folders in parallel; only new folders need another read.
    if (current && connected() && !(enCache() && current.groups.every(group => group in sesiones()))) void refreshSessions(current.groups);
  }));

  const composerMachine = createMemo(() => {
    const id = sessionId();
    const active = machines().find((m) => m.active)?.id ?? null;
    return id
      ? machineOf(id)?.headers["x-terminus-machine"] ?? active
      : draftMachine();
  });
  composer.installEffects();

  onMount(() => {
    const onDefaultMode = (e: Event) => {
      const change = (e as CustomEvent<DefaultPermissionModeChange>).detail;
      workspaceContext.modeChanged(change.workspace, change.mode);
    };
    window.addEventListener(DEFAULT_PERMISSION_MODE_EVENT, onDefaultMode);
    onCleanup(() => window.removeEventListener(DEFAULT_PERMISSION_MODE_EVENT, onDefaultMode));
  });
  return { abrirConComando, adoptarComando, composerMachine, contestarALaTerminal, detener, ejecutarComando, enviarDeLaCola, mandarCola, mandarElegido, razonDeLaCola, teclearAlComando };
}
