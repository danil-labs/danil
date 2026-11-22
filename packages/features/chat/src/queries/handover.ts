
import { type OpcionDeModelo } from "../../../../../apps/desktop/src/lib/models";
import { idProvisional } from "../../../../../apps/desktop/src/lib/taskDraft";
import { invoke } from "../../../../engine-client/src/client.ts";
import { capabilities } from "../../../../host/src/platform";
import { prosaDe } from "../../../../ui/src/Failure";
import { canHandOverTask, handoverMatches, shellCli, type HandoverPending } from "../model/handover";
import { type HandoverState } from "../model/handover.ts";
import { MODO_AUTOMATICO } from "../model/modes";
import { type Session } from "../model/transcript";
import { PROVIDER_HANDOFF_FEATURE, SESSION_MODEL_FEATURE } from "../../../../engine-client/src/index.ts";
import { batch, type Accessor, type Setter } from "solid-js";
import type { ComposerPort, Draft, DraftsPort, MachinesPort, SessionRow, createThreadsStore } from "./types.ts";
import type { createPanels } from "../../../../../apps/desktop/src/lib/panels.ts";
import type { createTabs } from "../../../../../apps/desktop/src/lib/tabs.ts";
import type { createPanelDeChat } from "../screens/PanelDeChat.tsx";
import type { createDraftSend } from "./draft-send.ts";
import type { createResyncCommands } from "./resync-commands.ts";
import type { createThreadStream } from "./thread-stream.ts";


/** Lo que el bloque usaba del cuerpo de App. */
export type HandoverDeps = { agent: Accessor<string>; avisar: (sesion: string) => (e: unknown) => void; borrador: () => Draft; busy: ReturnType<typeof createThreadStream>["busy"];
  claveAbierta: () => string; composer: ComposerPort; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined;
  draftMachine: () => string | null; drafts: DraftsPort; esChatDeAgente: (s: { chat_de_agente?: boolean; }) => boolean; filaDe: (id: string) => SessionRow | undefined;
  machines: MachinesPort; model: Accessor<string>; modo: Accessor<string>; mudarPestana: ReturnType<typeof createPanelDeChat>["mudarPestana"]; notifyProfiles: () => void;
  olvidarPestana: ReturnType<typeof createPanelDeChat>["olvidarPestana"];
  opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: { [k: string]: string; }; }; paneles: ReturnType<typeof createPanels>;
  permissions: ReturnType<typeof createThreadStream>["permissions"]; pestanas: ReturnType<typeof createTabs>; project: Accessor<string>;
  reatarVistaPrevia: (proyecto: string, session: string) => Promise<void>; responderPermiso: ReturnType<typeof createResyncCommands>["responderPermiso"]; sessionId: Accessor<string | null>;
  setDraftBases: Setter<Record<string, string>>; setError: Setter<string | null>; setNaciendo: Setter<{ project: string; row: SessionRow; }[]>;
  setTraspasoPendiente: ReturnType<typeof createDraftSend>["setTraspasoPendiente"]; threads: ReturnType<typeof createThreadsStore>;
  traspasoPendiente: ReturnType<typeof createDraftSend>["traspasoPendiente"]; traspasos: Accessor<Readonly<Record<string, HandoverState>>>; vivas: ReturnType<typeof createThreadStream>["vivas"];
  workspaceActivo: Accessor<string | null>; };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 4591–4883, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createHandover(deps: HandoverDeps) {
  const { agent, avisar, borrador, busy, claveAbierta, composer, deLaTarea, draftMachine, drafts, esChatDeAgente, filaDe, machines, model, modo, notifyProfiles, opcionesDeLaTarea, paneles, permissions, pestanas, project, reatarVistaPrevia, responderPermiso, sessionId, setDraftBases, setError, setNaciendo, setTraspasoPendiente, threads, traspasoPendiente, traspasos, vivas, workspaceActivo } = deps;
  const mudarPestana: HandoverDeps["mudarPestana"] = (...a: Parameters<HandoverDeps["mudarPestana"]>) => deps.mudarPestana(...a);
  const olvidarPestana: HandoverDeps["olvidarPestana"] = (...a: Parameters<HandoverDeps["olvidarPestana"]>) => deps.olvidarPestana(...a);
  /**
   * Elegir en el único menú del chat: la fila ya trae agente,
   * superficie y modelo, que forman una sola elección. Actualizarlos
   * en un batch impide un render intermedio con el modelo de Claude
   * bajo Codex, o el gratuito bajo la de pago de OpenCode.
   */
  function saveDraftConfiguration(mode?: string, clave = claveAbierta()) {
    drafts.configure({ ...composer.snapshot(), mode }, clave);
  }

  /**
   * Lo elegido en la caja de una tarea abierta, que `session.json` no guarda:
   * ahí vive con qué corrió el último turno, no con qué va a correr el
   * siguiente. Sin esto, salir de la tarea y volver revierte la elección.
   *
   * El agente no entra, salvo el traspaso pendiente: si otro cliente cambió el
   * CLI, el pendiente ya no parte del que la sesión tiene y no se aplica.
   */
  function restoreSessionConfiguration(session?: Session) {
    composer.restoreSessionDraft(borrador(), session);
  }

  function restoreDraftConfiguration() {
    composer.restoreDraft(borrador().configuration);
  }
  const effortDelTurno = composer.effortForTurn;

  function chooseEffort(id: string) {
    composer.chooseEffort(id);
    saveDraftConfiguration();
    // Como el modo en `elegirModo`: el turno vivo arrancó con el nivel de
    // entonces y no lo relee.
    const sesion = sessionId();
    if (sesion && busy()) {
      void invoke("set_effort", {
        project: project(),
        session: sesion,
        effort: effortDelTurno(),
      }, deLaTarea(sesion)).catch(avisar(sesion));
    }
    // El esfuerzo va con el modelo que la persona eligió en esta tarea, nunca
    // con el que la caja puso sola.
    if (sesion && model()) guardarModeloEnLaTarea(sesion, agent(), model(), id || null, true);
    // Como el modelo en `elegirModelo`: es lo que heredan sus temas nuevos.
    const fila = sessionId() ? filaDe(sessionId()!) : undefined;
    if (fila && esChatDeAgente(fila) && fila.agent) {
      void invoke("set_agent_model", {
        project: project(),
        name: fila.agent,
        provider: agent(),
        model: model() || null,
        effort: id || null,
      }).then(notifyProfiles).catch((error) => setError(prosaDe(error)));
    }
  }

  /**
   * El motor anunció `feature` en la máquina de la tarea. La de esta ventana
   * no lleva id en la fila; las demás sí. Sin fila de esa máquina no se puede
   * afirmar que no lo anuncie: `undefined`, no `false`.
   */
  const anunciaEnLaTarea = (id: string, feature: string): boolean | undefined => {
    if (!id) return undefined;
    const machine = filaDe(id)?.machine ?? null;
    const suya = machines().find((m) => (machine ? m.id === machine : m.local));
    if (!suya) return undefined;
    return suya.features?.includes(feature) === true;
  };
  const anunciaTraspaso = (id: string) => anunciaEnLaTarea(id, PROVIDER_HANDOFF_FEATURE);

  /**
   * La elección explícita del chip queda en la tarea (`session_model_v1`), con
   * el modelo y el esfuerzo juntos: un `task send` o el relay que llegan sin
   * modelo siguen con ella. Solo un modelo del CLI con que corre la tarea: con
   * un traspaso confirmado, o en un chat de agente que cambia de CLI, el del
   * otro lo guarda su primer turno. Un motor que no lo anuncia sigue como antes.
   */
  function guardarModeloEnLaTarea(id: string, agente: string, modelo: string, nivel: string | null, effortOnly?: boolean) {
    if (agente !== cliDeLaSesion(id) || drafts.peek(claveAbierta())?.provider || !anunciaEnLaTarea(id, SESSION_MODEL_FEATURE)) return;
    const proyecto = project();
    const opciones = opcionesDeLaTarea(id, workspaceActivo());
    void import("./handoverSend")
      .then((m) => m.saveSessionModel(proyecto, id, modelo, nivel, opciones, effortOnly))
      .catch(avisar(id));
  }

  const situacionDeTraspaso = (id: string) => ({
    session: id || null,
    running: vivas().includes(id),
    announced: anunciaTraspaso(id) ?? null,
    state: traspasos()[id],
  });

  /**
   * El CLI con el que la tarea corre hoy, según el motor. El pendiente del
   * borrador no cuenta: un `!` no es un turno del agente y no lo gasta.
   */
  const cliDeLaSesion = (id: string) =>
    traspasos()[id]?.provider ?? filaDe(id)?.provider ?? null;

  /**
   * Con qué corre un `!` y con qué el agente contesta su salida: el CLI y el
   * modelo de la sesión, no los del borrador. El traspaso confirmado no se
   * gasta en un comando de terminal.
   */
  const configDeLaSesion = (id: string) => {
    const estado = traspasos()[id];
    const fila = filaDe(id);
    return {
      provider: shellCli(cliDeLaSesion(id), agent()),
      model: estado?.model ?? fila?.model ?? null,
      effort: estado?.effort ?? null,
    };
  };

  /** Por qué no se ofrece el gesto, o `null`. No se deriva del encargado ni del fork: lo dice el motor. */
  const puedeTraspasar = (id: string) => canHandOverTask(situacionDeTraspaso(id));

  /** Aplica lo elegido a la caja del borrador, con o sin traspaso pendiente. */
  function aplicarOpcionDeModelo(opcion: OpcionDeModelo, clave: string, provider?: HandoverPending | null) {
    let nivel = "";
    batch(() => {
      nivel = composer.selectModel(opcion);
      if (provider !== undefined) drafts.handover(provider, clave);
      saveDraftConfiguration(undefined, clave);
    });
    return nivel;
  }

  function elegirModelo(opcion: OpcionDeModelo) {
    const abierta = sessionId();
    const fila = abierta ? filaDe(abierta) : undefined;
    const chatDeAgente = fila && esChatDeAgente(fila);
    // Cambiar de AGENTE en una tarea abierta es un traspaso —la conversación
    // viaja como texto—, no un ajuste del selector: se confirma antes de tocar
    // la caja. El modelo dentro del mismo agente sí cambia, y cada turno guarda
    // con cuál se contestó.
    if (abierta && !chatDeAgente && opcion.agent !== agent()) {
      const actual = traspasos()[abierta]?.provider ?? filaDe(abierta)?.provider ?? null;
      // Volver al CLI que la sesión tiene no es traspaso: solo suelta el
      // pendiente que se hubiera confirmado antes.
      if (opcion.agent === actual) {
        guardarModeloEnLaTarea(abierta, opcion.agent, opcion.model.id, aplicarOpcionDeModelo(opcion, claveAbierta(), null) || null);
        return;
      }
      if (!puedeTraspasar(abierta)) return;
      setTraspasoPendiente({
        clave: claveAbierta(),
        sesion: abierta,
        desde: actual ?? agent(),
        opcion,
      });
      return;
    }
    const nivel = aplicarOpcionDeModelo(opcion, claveAbierta());
    if (abierta) guardarModeloEnLaTarea(abierta, opcion.agent, opcion.model.id, nivel || null);
    if (chatDeAgente && fila.agent) {
      void invoke("set_agent_model", {
        project: project(),
        name: fila.agent,
        provider: opcion.agent,
        model: opcion.model.id,
        effort: nivel || null,
      }).then(notifyProfiles).catch((error) => setError(prosaDe(error)));
    }
  }

  /**
   * El traspaso confirmado deja el CLI en el borrador de esa tarea, no en la
   * preferencia de las nuevas, y se consume en el envío siguiente.
   */
  function confirmarTraspaso() {
    const pedido = traspasoPendiente();
    setTraspasoPendiente(null);
    if (!pedido) return;
    // Cambió la tarea o el borrador mientras se leía la confirmación: no se
    // aplica ni a la nueva ni al que estaba delante.
    if (!handoverMatches(pedido, sessionId(), claveAbierta())) return;
    if (!puedeTraspasar(pedido.sesion)) return;
    const actual = traspasos()[pedido.sesion]?.provider ?? filaDe(pedido.sesion)?.provider ?? null;
    if (actual !== null && pedido.desde !== actual) return;
    aplicarOpcionDeModelo(pedido.opcion, pedido.clave, {
      from: pedido.desde,
      to: pedido.opcion.agent,
    });
  }

  /**
   * Elegir modo en la caja, que además queda recordado para la tarea
   * siguiente. Solo por aquí: `load_session` y el ajuste al cambiar de agente
   * también mueven `modo`, y guardar esos convertiría abrir una tarea vieja en
   * cambiar con qué arrancan las próximas.
   */
  function elegirModo(id: string) {
    composer.chooseMode(id);
    saveDraftConfiguration(id);
    const sesion = sessionId();
    if (!sesion || !busy()) return;
    // El turno vivo arrancó con el modo de entonces y no lo relee: sin
    // pedírselo al proceso, la caja diría una cosa y el agente haría otra.
    void invoke("set_permission_mode", {
      project: project(),
      session: sesion,
      mode: id,
    }, deLaTarea(sesion))
      .then(() => {
        if (id === MODO_AUTOMATICO) return aprobarPendientes(sesion);
      })
      .catch(avisar(sesion));
  }

  /**
   * Cambiar de modo no contesta lo que el turno ya pidió: su gate sigue
   * abierto y el turno, esperando. Se contesta como el botón «Aprobar».
   */
  async function aprobarPendientes(sesion: string) {
    for (const p of permissions().filter((x) => x.session === sesion)) {
      // Otro modo elegido mientras volvía el cambio: aprobar ya no es lo pedido.
      if (sessionId() === sesion && modo() !== MODO_AUTOMATICO) return;
      if (!permissions().some((x) => x.requestId === p.requestId)) continue;
      await responderPermiso(p, true);
    }
  }

  /** La fila y la pestaña de una tarea que Rust todavía no creó. Devuelve su id provisional. */
  function pintarNaciendo(proyecto: string, titulo: string, con: { provider: string; model: string | null }, encargado: string | null): string {
    const provisional = idProvisional();
    const ahora = Date.now();
    // Dónde va a nacer, como las filas que luego traiga esa máquina
    // (`@terminus/fleet` `tag`): sin ella, en la web el riel la ponía en un grupo
    // «Esta máquina» aparte hasta que llegaba su fila del disco. La de la
    // ventana no lleva máquina, igual que sus filas.
    const destino = draftMachine() ?? capabilities().remoteCreate?.(workspaceActivo())?.machine ?? null;
    const machine = destino && !machines().find((m) => m.id === destino)?.local ? destino : undefined;
    setNaciendo((ns) => [
      ...ns,
      {
        project: proyecto,
        row: {
          id: provisional,
          title: titulo,
          provider: con.provider,
          model: con.model,
          refs: [],
          created_at: ahora,
          updated_at: ahora,
          turns: 1,
          parent: null,
          subagent: null,
          esperando: false,
          stage: null,
          agent: encargado,
          parent_agent: null,
          chat_de_agente: false,
          ...(machine ? { machine } : {}),
        },
      },
    ]);
    // Y delante, en el mismo gesto: el efecto que reparte las pestañas vuelve
    // a activar la que ya estaba. Nacer sin activarse devuelve la vista a la
    // tarea anterior hasta que Rust contesta. Y conservada: como vista
    // sustituiría a la pestaña de delante, y el siguiente clic, a ella.
    batch(() => {
      pestanas.ensure({ id: provisional, project: proyecto, titulo });
      pestanas.pin(provisional);
      pestanas.activate(provisional);
    });
    return provisional;
  }

  /** La tarea que nació toma lo que la ventana sin id tenía suyo: hilo, borrador, fila y pestaña. */
  function adoptarNacida(id: string, nacida: { provisional: string | null; proyecto: string; titulo: string; claveBorrador: string }) {
    const { provisional, proyecto, claveBorrador } = nacida;
    setDraftBases((bases) => {
      const next = { ...bases };
      delete next[claveBorrador];
      return next;
    });
    // La conversación que nació: su hilo se muda de `""` a su id. Los
    // eventos del turno pueden haber llegado ANTES que el id —Rust crea la
    // sesión y emite con ella mientras el `invoke` vuelve— y ya están en
    // `hilos[id]`; se conservan detrás de lo propio.
    threads.adoptDraft(id);
    // Y su borrador: lo que quedó sin mandar sigue con ella.
    drafts.promote(claveBorrador, id);
    if (provisional) {
      batch(() => {
        // La fila antes que la pestaña: una pestaña sin fila pide la lista.
        setNaciendo((ns) =>
          ns.map((n) => (n.row.id === provisional ? { ...n, row: { ...n.row, id } } : n)),
        );
        mudarPestana(provisional, id);
        pestanas.commitDraft(provisional, { id, project: proyecto, titulo: nacida.titulo });
        paneles.renameTabs([[provisional, id]]);
        olvidarPestana(provisional);
      });
    } else pestanas.ensure({ id, project: proyecto, titulo: "" });
    void reatarVistaPrevia(proyecto, id);
  }
  return { adoptarNacida, chooseEffort, configDeLaSesion, confirmarTraspaso, effortDelTurno, elegirModelo, elegirModo, pintarNaciendo, restoreDraftConfiguration, restoreSessionConfiguration, saveDraftConfiguration, situacionDeTraspaso };
}
