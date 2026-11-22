import type { Author, Msg, Preview } from "../../../../../apps/desktop/src/lib/project-block-types.ts";
import type { ClonEnCurso } from "../screens/AddWorkdir.tsx";
import type { SessionRow } from "../screens/Sessions.tsx";
export function createCloneFolder(deps: { ATTACHMENT_DOCUMENTS_FEATURE: "attachment_documents_v1"; attention: { list: import("solid-js").Accessor<import("../../../../shell/src/shell/attention").WorkspaceAttention[]>; of: (workspace: string | null) => import("../../../../shell/src/shell/attention").TaskAttention[]; unseen: (workspace: string | null) => Set<string>; markSeen(workspace: string, session: string): void; }; avisarDeLosArboles: (session: string) => void; clave: (turno: string, pregunta: string) => string; claveDelHilo: () => string; colaSuelta: import("solid-js").Accessor<Readonly<Record<string, Msg[]>>>; createMemo: { < Next extends Prev, Prev = Next>(fn: import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer< Prev>, Next>): import("solid-js").Accessor< Next>; < Next extends Prev, Init = Next, Prev = Next>(fn: import("solid-js").EffectFunction< Init | Prev, Next>, value: Init, options?: import("solid-js").MemoOptions< Next>): import("solid-js").Accessor< Next>; }; createSignal: { < T>(): import("solid-js").Signal< T | undefined>; < T>(value: T, options?: import("solid-js").SignalOptions< T>): import("solid-js").Signal< T>; }; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; draftOptions: () => { headers: { "x-terminus-machine": string; }; } | undefined; esperandoFila: Set<string>; grupos: import("solid-js").Accessor<string[]>; hiloAbierto: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/project-block-types.ts").OptimisticHistoryState & { base: Msg[]; vivo: Msg[]; guardados?: ReadonlySet<string>; }>; hilos: import("solid-js").Accessor<Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").OptimisticHistoryState & { base: Msg[]; vivo: Msg[]; guardados?: ReadonlySet<string>; }>>; invoke: < T>(command: string, args?: import("@tauri-apps/api/core").InvokeArgs, options?: import("@tauri-apps/api/core").InvokeOptions) => Promise< T>; leerTarea: (project: string, id: string, before?: number | null | undefined) => Promise<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Session>; loadResult: (id: string, session: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Session, clear: boolean, generation: number) => void; machines: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Machine[]>; msgs: import("solid-js").Accessor<Msg[]>; naciendo: import("solid-js").Accessor<{ project: string; row: SessionRow; }[]>; onCleanup: < T extends () => any>(fn: T) => T; pedidas: Map<string, Set<string>>; pestanas: { pinned: import("solid-js").Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/tabs").Tab[]>; active: import("solid-js").Accessor<string | null>; activeTab: () => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: import("../../../../../apps/desktop/src/lib/tabs").ContentTab): void; activate: (id: string | null) => void; close: (id: string) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; canReopen: () => boolean; reopen(alive: (p: import("../../../../../apps/desktop/src/lib/tabs").Tab) => boolean): import("../../../../../apps/desktop/src/lib/tabs").Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: import("solid-js").Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): import("../../../../../apps/desktop/src/lib/tabs").FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; project: import("solid-js").Accessor<string>; remoteChildScope: () => import("../../../../tasks/src/remote").RemoteScope; retoques: import("solid-js").Accessor<Record<string, { cambio: Partial< SessionRow>; n: number; }>>; sesiones: import("solid-js").Accessor<Record<string, SessionRow[]>>; sesionesConPestana: import("solid-js").Accessor<string[]>; sessionId: import("solid-js").Accessor<string | null>; sessionRefresh: < T>(options: { read: (project: string) => Promise<T[]>; apply: (update: (previous: import("../../../../session/src/sessionRefresh").SessionLists< T>) => import("../../../../session/src/sessionRefresh").SessionLists< T>) => void; projects: () => string[]; key: (row: T) => string; schedule?: (run: () => void, ms: number) => unknown; cancel?: (handle: unknown) => void; gather?: number; timeout?: number; }) => { refresh: (projects: string[]) => Promise<void>; gathered: (projects: string[]) => Promise<void>; reset(): void; }; setSesiones: import("solid-js").Setter<Record<string, SessionRow[]>>; threadPreview: (thread: readonly { role: string; text: string; meta?: string; }[]) => string | undefined; unconfirmedOpen: (rows: unknown) => readonly string[]; vivas: import("solid-js").Accessor<string[]>; withRemoteLaunchers: < R extends import("../../../../tasks/src/remote").RemoteRow>(rows: readonly R[], scope: import("../../../../tasks/src/remote").RemoteScope) => R[]; workspaceActivo: import("solid-js").Accessor<string | null>; workspaceContext: { active: import("solid-js").Accessor<string | null>; mode: import("solid-js").Accessor<string | null>; root: import("solid-js").Accessor<string | null>; confirmed: import("solid-js").Accessor<boolean>; generation: () => number; beginTransition: (startup: { active: string | null; workspaces: { id: string; context_root: string | null; default_permission_mode: string | null; }[]; }) => Readonly<{ generation: number; material: number; }> & Readonly<{ previous: string | null; workspace: string | null; }>; activate: (token: Readonly<{ generation: number; material: number; }> & Readonly<{ previous: string | null; workspace: string | null; }>) => boolean; beginMaterial: () => Readonly<{ generation: number; material: number; }>; current: (token: Readonly<{ generation: number; material: number; }>) => boolean; currentMaterial: (token: Readonly<{ generation: number; material: number; }>) => boolean; confirmContext: (token: Readonly<{ generation: number; material: number; }>, candidate: string | null, listed: { id: string; root: boolean; missing: boolean; }[]) => "obsolete" | "unavailable" | "accepted"; modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void; dispose: () => void; } } & { _bridge: Record<string, any> }) {
  const _bridge = deps._bridge;
  const { ATTACHMENT_DOCUMENTS_FEATURE, attention, avisarDeLosArboles, clave, claveDelHilo, colaSuelta, createMemo, createSignal, deLaTarea, draftOptions, esperandoFila, grupos, hiloAbierto, hilos, invoke, leerTarea, loadResult, machines, msgs, naciendo, onCleanup, pedidas, pestanas, project, remoteChildScope, retoques, sesiones, sesionesConPestana, sessionId, sessionRefresh, setSesiones, threadPreview, unconfirmedOpen, vivas, withRemoteLaunchers, workspaceActivo, workspaceContext } = deps;
  /** El clon en vuelo, que el riel enseña mientras no hay proyecto que listar. */
  const [clonEnCurso, setClonEnCurso] = createSignal< ClonEnCurso | null>(null);
  // Cerrar la configuración es el único momento en que las cuentas pudieron
  // cambiar sin que el resto de la app se entere.
  const [cuentasTocadas, setCuentasTocadas] = createSignal(0);

  // Los oyentes se montan una vez y leen las señales al recibir cada evento:
  // guardar fuera el valor de `sessionId()` o `agents()` los dejaría
  // trabajando con el estado del montaje. `firmas` es una variable y no una
  // señal: nada pinta sus valores, solo los consultan las funciones de respuesta.

  // Con qué se firma lo que llega de cada tarea, por sesión: con una sola
  // firma, arrancar un segundo turno pisa la del primero, y al volver a la
  // primera su texto sale con el autor del otro agente. La clave `""` es la
  // del turno sin sesión en disco; se muda a su id en cuanto Rust lo
  // devuelve.
  const firmas: Record<string, Author | null> = {};
  // Con qué modelo se lanzó el turno en vivo, con las mismas claves que
  // `firmas`: la fila del mensaje lo enseña hasta que el cierre guarde el observado.
  const modelosEnVivo: Record<string, string | null> = {};

  // Hay una pregunta del agente que nadie contestó. Se deriva de la
  // transcripción, no se guarda: una marca de "pendiente" aparte sería un
  // segundo estado capaz de contradecir a los turnos, dejando seguir el
  // trabajo sin el dato que el agente pidió. Mismo criterio que
  // `sin_contestar` en `workspace/sessions.rs`.
  const preguntasPendientes = (messages: Msg[]) => {
    const contestadas = new Set(
      messages
        .flatMap((m) => m.respuestas ?? [])
        .map((r) => clave(r.turn, r.question)),
    );
    return messages.some(
      (m) =>
        !!m.turno &&
        (m.preguntas ?? []).some((p) => !contestadas.has(clave(m.turno!, p.id))),
    );
  };
  // Con la ventana lejos del final, lo que espera es lo de la última cola leída, no lo que se ve.
  const esperando = createMemo(() => {
    const cola = colaSuelta()[claveDelHilo()];
    return preguntasPendientes(cola ? [...cola, ...(hiloAbierto()?.vivo ?? [])] : msgs());
  });
  /**
   * Qué tareas tienen una pregunta sin contestar, para la tira. De la abierta
   * manda lo derivado de su conversación —es más fresco que el historial, que
   * se relee al cerrar el turno—; de las demás, lo que dice su fila.
   */
  const preguntadas = createMemo(() => {
    const abierta = sessionId();
    const otras = Object.values(sesiones())
      .flat()
      .filter((r) => r.esperando && r.id !== abierta)
      .map((r) => r.id);
    const ids = new Set(otras);
    for (const [id, hilo] of Object.entries(hilos())) {
      if (preguntasPendientes([...hilo.base, ...hilo.vivo])) ids.add(id);
    }
    if (abierta && esperando()) ids.add(abierta);
    return [...ids].sort();
  }, undefined, { equals: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]) });

  function sesionesConEstado() {
    const pending = new Set(preguntadas());
    const unseen = attention.unseen(workspaceActivo());
    const listas = sesiones();
    const nuevas = naciendo();
    const proyectos = new Set([...Object.keys(listas), ...nuevas.map((n) => n.project)]);
    // Una hija remota cuelga de su coordinador como una delegada más (`remote_parent`).
    const remotas = remoteChildScope();
    return Object.fromEntries([...proyectos].map((project) => {
      const rows = withRemoteLaunchers(listas[project] ?? [], remotas);
      // Delante: `list_live_sessions` ordena por cuándo nacieron, y estas acaban de
      // nacer. La misma fila dos veces mientras el refresco llega se evita
      // mirando lo que ya trajo el disco.
      const enDisco = new Set(rows.map((row) => row.id));
      const propias = nuevas
        .filter((n) => n.project === project && !enDisco.has(n.row.id))
        .map((n) => n.row);
      const cambios = retoques();
      return [project, [...propias, ...rows.map(leida => {
        const retoque = cambios[leida.id];
        const row = retoque ? { ...leida, ...retoque.cambio } : leida;
        const preview = threadPreview(hilos()[row.id]?.vivo ?? []) ?? row.last_message;
        const sinVer = unseen.has(row.id);
        return row.esperando === pending.has(row.id) && preview === row.last_message && !!row.sin_ver === sinVer ? row : {
          ...row, esperando: pending.has(row.id), last_message: preview, sin_ver: sinVer,
        };
      })]];
    }));
  }

  const sessionLists = sessionRefresh< SessionRow>({
    read: async (project) => {
      const open = sesionesConPestana();
      const rows = await invoke<SessionRow[]>("list_live_sessions", { project, open });
      // La pestaña que su máquina no confirmó no cuenta como pedida: no se cierra ni se pide en bucle.
      const sinConfirmar = new Set(unconfirmedOpen(rows));
      const confirmadas = open.filter((id) => !sinConfirmar.has(id));
      pedidas.set(project, new Set(confirmadas));
      for (const id of confirmadas) esperandoFila.delete(id);
      return rows;
    },
    apply: (update) => setSesiones(update),
    projects: () => grupos(),
    key: (row) => row.id,
    // Una mutación del CLI avisa dos veces seguidas, y varios agentes a la vez, una ráfaga.
    gather: 200,
  });
  onCleanup(() => sessionLists.reset());
  function refreshSessions(proyectos: string[]) {
    return sessionLists.refresh(proyectos);
  }
  /**
   * Qué carpetas relee un aviso sobre `session`: la suya y la de su padre, que
   * pinta el estado de sus hijas. Una tarea que el riel todavía no conoce (la
   * creó otra ventana u otra máquina) puede estar en cualquiera: todas.
   */
  function carpetasDeTarea(session: string, project?: string | null): string[] {
    const listas = sesiones();
    const buscar = (id: string) => Object.keys(listas).find((p) => listas[p].some((r) => r.id === id));
    const suya = project ?? buscar(session);
    if (suya === undefined) return grupos();
    const fila = listas[suya]?.find((r) => r.id === session);
    const delPadre = fila?.parent ? buscar(fila.parent) : undefined;
    return [...new Set([suya, ...(delPadre === undefined ? [] : [delPadre])])];
  }
  /** La relectura que pide un evento del servicio; la de un gesto de la persona va sin espera. */
  function refreshSessionsOnEvent(proyectos: string[]) {
    return sessionLists.gathered(proyectos);
  }
  // Un hueco del stream o un motor nuevo se lleva los eventos `session` de en medio: se
  // relee lo que habrían refrescado. Las tareas vivas las reconcilia `reconcileActiveTurns`.
  function releerTrasHueco() {
    const generation = workspaceContext.generation();
    void refreshSessionsOnEvent(grupos());
    for (const pestana of pestanas.open()) avisarDeLosArboles(pestana.id);
    const abierta = sessionId();
    if (!abierta || vivas().includes(abierta)) return;
    avisarDeLosArboles(abierta);
    void leerTarea(project(), abierta)
      .then((s) => loadResult(abierta, s, true, generation))
      .catch(() => {});
  }

  // La miniatura de un adjunto del mensaje, o `null` si no hay que enseñar
  // una: null no es un fallo, y no se distingue del error. Un PDF, un `.docx`
  // o una imagen que no cabe se pintan igual —con su tarjeta—, y quien llama
  // no decide con la diferencia. Lo que sí sería un fallo es tumbar la
  // transcripción por un archivo que ya no está. Resuelve contra la tarea
  // abierta: de esa son los mensajes que `Chat` está pintando.
  async function previewDeAdjunto(rel: string): Promise< Preview | null> {
    try {
  // Un adjunto se guarda por su ruta del sistema. Los turnos anteriores a
  // v0.1.23 guardaron una relativa `entradas/…`, y esas van por
  // `attachment_preview`, que resuelve la ruta él para no ser un lector de
  // archivos abierto a la ventana.
      const esDeLaTarea = rel.startsWith("entradas/");
      const id = sessionId();
      if (esDeLaTarea && !id) return null;
      return esDeLaTarea
        ? await invoke< Preview>("attachment_preview", {
            project: project(),
            id,
            rel,
          }, deLaTarea(id))
        : await previewOn(rel, id);
    } catch {
      return null;
    }
  }

  async function miniaturaDeAdjunto(rel: string): Promise<string | null> {
    return (await previewDeAdjunto(rel))?.data_url ?? null;
  }

  // Lo que se mandó a una tarea de otra máquina vive allá; lo que todavía no
  // salió (el globo mientras se manda) sigue en la de la ventana.
  async function previewOn(path: string, id: string | null): Promise< Preview> {
    const there = deLaTarea(id);
    if (!there) return invoke< Preview>("preview_file", { path, rel: path });
    try {
      return await invoke< Preview>("preview_file", { path, rel: path }, there);
    } catch {
      return invoke< Preview>("preview_file", { path, rel: path });
    }
  }

  /** Si la máquina de esas opciones anuncia la extensión de documentos. */
  function documentosEn(options: { headers: Record<string, string> } | undefined): boolean {
    const machine = options?.headers["x-terminus-machine"];
    const fila = machines().find((m) => (machine ? m.id === machine : m.local));
    return fila?.features?.includes(ATTACHMENT_DOCUMENTS_FEATURE) === true;
  }

  /** Las opciones de la conversación abierta o del borrador, como en `pegarImagen`. */
  function opcionesDeAdjunto() {
    const abierta = sessionId();
    return abierta ? deLaTarea(abierta) : draftOptions();
  }
  const _out = { clonEnCurso, setClonEnCurso, cuentasTocadas, setCuentasTocadas, firmas, modelosEnVivo, esperando, preguntadas, sesionesConEstado, sessionLists, refreshSessions, carpetasDeTarea, refreshSessionsOnEvent, releerTrasHueco, previewDeAdjunto, miniaturaDeAdjunto, documentosEn, opcionesDeAdjunto };
  Object.assign(_bridge, _out);
  return _out;
}
