import type { Session } from "../../../../../apps/desktop/src/lib/project-block-types.ts";
import type { Space } from "../../../../../apps/desktop/src/lib/spaces.ts";
import type { TaskTab } from "../../../../../apps/desktop/src/lib/tabs.ts";
export function createDeskStrip(deps: { abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; activarPestana: (p: import("../../../../../apps/desktop/src/lib/tabs").Tab) => Promise<void>; activeSpace: () => Space | null; adjuntosEn: Map<string, string>; appendToStoredStrip: (ws: string, space: string, p: { id: string; project: string; titulo: string; }) => void; attention: { list: import("solid-js").Accessor<import("../../../../shell/src/shell/attention").WorkspaceAttention[]>; of: (workspace: string | null) => import("../../../../shell/src/shell/attention").TaskAttention[]; unseen: (workspace: string | null) => Set<string>; markSeen(workspace: string, session: string): void; }; batch: < T>(fn: import("solid-js").Accessor< T>) => T; carpetasDelEscritorio: < P extends { id: string; }>(projects: readonly P[], desk: Space | null, sesiones: Record<string, readonly (import("../../../../tasks/src/flat").LauncherRow & { id?: string; space?: string | null; archived?: boolean | null; pinned?: boolean | null; machine?: string | null; })[]>) => P[]; claveDeBorrador: (session: string | null, project: string, handler?: string | null) => string; connected: import("solid-js").Accessor<boolean>; conservar: < T>(previous: T[], incoming: T[], key: (row: T) => string) => T[]; createComposerStore: (deps: { invoke: < T>(command: string, args?: Record<string, unknown>, options?: { headers: Record<string, string>; }) => Promise< T>; withLastAnswer: < T>(machine: string | null, key: string, read: () => Promise< T>) => Promise< T>; scope: { workspace: () => string | null; machine: () => string | null; machineOn: () => boolean | undefined; connected: () => boolean; session: () => string | null; }; workspaceMode: () => string | null; draftConfiguration: () => import("../../../../../apps/desktop/src/lib/project-block-types.ts").ComposerConfiguration | undefined; }) => { agents: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Agent[]>; agent: import("solid-js").Accessor<string>; superficies: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/surfaces").Superficie[] | null>; superficie: import("solid-js").Accessor<string>; catalogos: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/models").CatalogosDeModelos>; models: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").AgentModels | null>; modelosParaAgentes: import("solid-js").Accessor<{ superficies: import("../../../../../apps/desktop/src/lib/surfaces").Superficie[]; catalogos: import("../../../../../apps/desktop/src/lib/models").CatalogosDeModelos; }>; model: import("solid-js").Accessor<string>; effort: import("solid-js").Accessor<string>; modo: import("solid-js").Accessor<string>; modos: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").ModoDePermiso[]>; skills: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/skills").Skill[]>; cliCommands: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/skills").CliCommand[]>; sideCommand: import("solid-js").Accessor<string | null>; menu: () => import("../../../../../apps/desktop/src/lib/surfaces").Superficie[] | null; options: () => { headers: { "x-terminus-workspace"?: string | undefined; "x-terminus-machine"?: string | undefined; }; }; installEffects: () => void; refreshProviders: () => Promise<void>; prepareCredits: (prepare: (headers: Record<string, string>) => Promise<unknown>) => Promise<void>; startNewDraft: () => void; refreshSurfaces: (inicial: boolean) => Promise<void>; refreshCommands: (a: string) => void; readModels: (a: string, forzar?: boolean) => Promise<void>; snapshot: () => import("../../../../../apps/desktop/src/lib/project-block-types.ts").ComposerConfiguration; effortForTurn: () => string | null; restoreDraft: (configuration?: import("../../../../../apps/desktop/src/lib/project-block-types.ts").ComposerConfiguration) => void; restoreSessionDraft: (draft: { configuration?: import("../../../../../apps/desktop/src/lib/project-block-types.ts").ComposerConfiguration; provider?: { from: string; to: string; }; }, session?: { provider?: string | null; }) => void; useProfile: (profile: { provider?: string | null; model?: string | null; effort?: string | null; }) => void; resumeTask: (selection: { provider: string; model: string; effort: string; mode?: string; }) => void; runtimeFact: (fact: { kind: "model" | "effort" | "mode"; value: string; }) => void; selectModel: (choice: import("../../../../../apps/desktop/src/lib/models").OpcionDeModelo) => string; chooseEffort: (id: string) => void; chooseMode: (id: string) => void; unavailable: () => void; dispose: () => void; }; createDraftsStore: (deps: { key: () => string; workspace: () => string | null; generation: () => number; project: () => string; projects: () => import("../../../../../apps/desktop/src/lib/model").Project[]; sources: () => import("../../../../../apps/desktop/src/lib/model").Source[] | null | undefined; prepareAttachments: (paths: string[], project: string) => Promise<string[]>; }) => { peek: (key: string) => import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; current: () => import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; sourceIds: import("solid-js").Accessor<string[]>; excludedSourceIds: import("solid-js").Accessor<string[]>; attached: import("solid-js").Accessor<string[]>; pendingMaterial: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Source[]>; context: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Source[]>; input: () => string; files: () => string[]; changeText: (value: string, inputType?: string, change?: import("../../../../../apps/desktop/src/lib/taskMentions").TextEdit) => void; history: (redo: boolean) => boolean; addFiles: (paths: string[]) => Promise<void>; addSource: (id: string) => void; removeSource: (id: string) => void; recipient: (name: string, label: string, trigger: import("../../../../../apps/desktop/src/lib/mentions").Trigger) => void; reference: (target: import("../../../../../apps/desktop/src/lib/taskMentions").MentionTarget, label: string, trigger: import("../../../../../apps/desktop/src/lib/mentions").Trigger) => void; replaceFiles: (files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; replaceAttached: (ids: string[]) => string[]; acceptSources: (ids: string[]) => string[]; configure: (configuration: import("../../../../../apps/desktop/src/lib/project-block-types.ts").DraftConfiguration, key?: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; handover: (provider: import("../../../../../apps/desktop/src/lib/project-block-types.ts").HandoverPending | null | undefined, key?: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; invalidateProvider: (key: string, provider: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft | { input: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; mentionHistory?: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }[]; mentionFuture?: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }[]; sourceIds: string[]; excludedSourceIds: string[]; archivos: string[]; configuration?: import("../../../../../apps/desktop/src/lib/project-block-types.ts").DraftConfiguration; }; }; restoreSession: (key: string, excluded: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; retryText: (text: string, mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; takeFiles: (key: string, files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; restoreFailed: (key: string, message: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }, files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; sentSources: (key: string, ids: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; continueFrom: (prompt: string, path: string, sources: string[], excluded: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; promote: (from: string, to: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; drop: (key: string) => Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft>; reset: () => void; dispose: () => void; }; createEffect: { < Next>(fn: import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer< Next>, Next>): void; <Next, Init = Next>(fn: import("solid-js").EffectFunction< Init | Next, Next>, value: Init, options?: import("solid-js").EffectOptions & { render?: boolean; }): void; }; createMemo: { < Next extends Prev, Prev = Next>(fn: import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer< Prev>, Next>): import("solid-js").Accessor< Next>; < Next extends Prev, Init = Next, Prev = Next>(fn: import("solid-js").EffectFunction< Init | Prev, Next>, value: Init, options?: import("solid-js").MemoOptions< Next>): import("solid-js").Accessor< Next>; }; createSignal: { < T>(): import("solid-js").Signal< T | undefined>; < T>(value: T, options?: import("solid-js").SignalOptions< T>): import("solid-js").Signal< T>; }; createThreadsStore: (deps: Parameters<typeof import("../../../../../apps/desktop/src/lib/project-block-types.ts").createThreadsCore>[0]) => { read: (project: string, id: string, before?: number | null | undefined) => Promise< Session>; acceptSession: (id: string, session: Session, clear: boolean, generation: number, latest?: boolean | undefined) => boolean; activities: (id: string, visible: readonly import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]) => import("../../../../../apps/desktop/src/lib/activityObservation").ObservedTurnActivity<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg>[]; beginActivity: (id: string, startedAt: number | null, startConfirmed?: boolean) => void; finishActivity: (id: string, workspace?: string | null) => void; rows: import("solid-js").Accessor<Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").OptimisticHistoryState & { base: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]; vivo: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]; guardados?: ReadonlySet<string>; }>>; current: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/project-block-types.ts").OptimisticHistoryState & { base: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]; vivo: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]; guardados?: ReadonlySet<string>; }>; messages: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]>; loading: import("solid-js").Accessor<string | null>; origins: import("solid-js").Accessor<Readonly<Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").TranscriptOrigin | null>>>; offline: import("solid-js").Accessor<Readonly<Record<string, string>>>; machineWaits: import("solid-js").Accessor<Readonly<Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").MachineWait>>>; handovers: import("solid-js").Accessor<Readonly<Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").HandoverState>>>; olderAvailable: import("solid-js").Accessor<Readonly<Record<string, boolean>>>; recentAvailable: import("solid-js").Accessor<Readonly<Record<string, boolean>>>; olderStatus: import("solid-js").Accessor<Readonly<Record<string, import("../../../../chat/src/history").OlderState>>>; recentTail: import("solid-js").Accessor<Readonly<Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]>>>; appendLive: (session: string, messages: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[], workspace?: string | null) => void; appendPersisted: (session: string, messages: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]) => void; appendOptimistic: (session: string, messages: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]) => void; acknowledgeOptimistic: (session: string, messages: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]) => void; commitUniqueTurn: (session: string, message: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg) => void; replaceTurn: (session: string, message: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg) => void; reviseOptimistic: (session: string, target: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg, patch: Pick<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg, "respuestas" | "author">) => void; rejectOptimistic: (session: string, messages: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]) => void; question: (session: string, fields: Pick<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg, "turno" | "preguntas" | "questionRequestId" | "agent">, workspace?: string | null) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; finishSteps: (session: string) => void; event: (payload: import("../../../../../apps/desktop/src/lib/project-block-types.ts").ChatEvent, metadata: import("../../../../../apps/desktop/src/lib/project-block-types.ts").TranscriptMetadata) => void; older: (project: string, id: string) => Promise<(() => void) | null>; latest: (id: string) => Promise<void>; replaceHistory: (session: string, leida: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[], vaciarVivo: boolean, antepuesta?: boolean, guardados?: ReadonlySet<string>, cola?: ReadonlySet<string>, readRevision?: number) => void; saveWorkspace: (previous: string | null) => void; activateWorkspace: (workspace: string | null) => void; resetService: () => void; adoptDraft: (id: string) => void; dropSaved: (workspace: string, id: string) => void; flush: () => void; markMachineWait: (id: string, wait: import("../../../../../apps/desktop/src/lib/project-block-types.ts").MachineWait | null) => void; markAwake: (id: string) => void; startLoading: (id: string) => void; finishLoading: (id: string) => void; reading: (id: string, active: boolean) => void; drop: (session: string) => void; dispose: () => void; }; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; deleteLayout: (workspace: string, space: string) => void; deleteStoredStrip: (ws: string, space: string) => void; enMaquina: (machine: string | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; esProvisional: (id: string | null | undefined) => boolean; escribirPref: (clave: string, valor: unknown) => void; escritorio: import("solid-js").Accessor<string | null>; escritorioDeFila: (row: (import("../../../../tasks/src/flat").LauncherRow & { id?: string; space?: string | null; archived?: boolean | null; pinned?: boolean | null; machine?: string | null; }) | undefined, vivas: readonly Space[]) => string | null; filaDe: (id: string) => import("../screens/Sessions").SessionRow | undefined; grupos: import("solid-js").Accessor<string[]>; hablandoCon: import("solid-js").Accessor<{ project: string; name: string; } | null>; invoke: < T>(command: string, args?: import("@tauri-apps/api/core").InvokeArgs, options?: import("@tauri-apps/api/core").InvokeOptions) => Promise< T>; isTaskTab: (p: import("../../../../../apps/desktop/src/lib/tabs").Tab) => p is TaskTab; leerPref: < T>(clave: string, porOmision: T) => T; loadWindowThreads: (skip: string | null) => void; machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; machines: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Machine[]>; migrateLegacyStrip: (ws: string, firstSpace: string) => void; modeloDeSubtarea: (session: import("../../../../tasks/src/surfaces").ModelSession) => string | null; naciendo: import("solid-js").Accessor<{ project: string; row: import("../screens/Sessions").SessionRow; }[]>; olvidarPestana: (session: string) => void; on: { <S, Next extends Prev, Prev = Next>(deps: import("solid-js").AccessorArray< S> | import("solid-js").Accessor< S>, fn: import("solid-js").OnEffectFunction<S, undefined | import("solid-js").NoInfer< Prev>, Next>, options?: import("solid-js").OnOptions & { defer?: false; }): import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer< Next>, import("solid-js").NoInfer< Next>>; <S, Next extends Prev, Prev = Next>(deps: import("solid-js").AccessorArray< S> | import("solid-js").Accessor< S>, fn: import("solid-js").OnEffectFunction<S, undefined | import("solid-js").NoInfer< Prev>, Next>, options: import("solid-js").OnOptions | { defer: true; }): import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer< Next>>; }; onCleanup: < T extends () => any>(fn: T) => T; paneles: { columns: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/panels").PanelGroup[][]>; widths: import("solid-js").Accessor<number[]>; heights: import("solid-js").Accessor<number[]>; rowCount: () => number; activeSite: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/panels").PanelSite>; sites: () => import("../../../../../apps/desktop/src/lib/panels").PanelSite[]; siteOf: (id: string) => import("../../../../../apps/desktop/src/lib/panels").PanelSite | null; groupAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => import("../../../../../apps/desktop/src/lib/panels").PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => string[]; activeTabAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => string | null; isVisible: (id: string) => boolean; focus(site: import("../../../../../apps/desktop/src/lib/panels").PanelSite): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move(id: string, a: import("../../../../../apps/desktop/src/lib/panels").PanelSite, index?: number): boolean; split(id: string): boolean; canSplitAt: (id: string, reference: import("../../../../../apps/desktop/src/lib/panels").PanelSite, side: import("../../../../../apps/desktop/src/lib/panels").Side, unplaced?: boolean) => boolean; splitAt: (id: string, reference: import("../../../../../apps/desktop/src/lib/panels").PanelSite, side: import("../../../../../apps/desktop/src/lib/panels").Side) => boolean; join(): boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => import("../../../../../apps/desktop/src/lib/panels").Layout; restore(layout: import("../../../../../apps/desktop/src/lib/panels").Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; pegadasEn: Map<string, string>; pestanaActiva: () => string | null; pestanas: { pinned: import("solid-js").Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/tabs").Tab[]>; active: import("solid-js").Accessor<string | null>; activeTab: () => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: import("../../../../../apps/desktop/src/lib/tabs").ContentTab): void; activate: (id: string | null) => void; close: (id: string) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; canReopen: () => boolean; reopen(alive: (p: import("../../../../../apps/desktop/src/lib/tabs").Tab) => boolean): import("../../../../../apps/desktop/src/lib/tabs").Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: import("solid-js").Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): import("../../../../../apps/desktop/src/lib/tabs").FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; project: import("solid-js").Accessor<string>; projectList: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Project[]>; prosaDe: (e: unknown, datos?: { [x: string]: string | number; }) => string; readLayout: (workspace: string, space: string) => import("../../../../../apps/desktop/src/lib/panels").Layout | null; sesiones: import("solid-js").Accessor<Record<string, import("../screens/Sessions").SessionRow[]>>; sessionId: import("solid-js").Accessor<string | null>; setBuscando: import("solid-js").Setter<import("../../../../shell/src/shell/GlobalSearch").SearchFilter | null>; setError: import("solid-js").Setter<string | null>; setEscritorio: import("solid-js").Setter<string | null>; setProyectoAbierto: import("solid-js").Setter<string | null>; setSpaces: import("solid-js").Setter<Space[]>; spaceName: (i: { name: string | null; } | null | undefined) => string; spaces: import("solid-js").Accessor<Space[]>; spacesWithLayout: (workspace: string) => string[]; spacesWithStoredStrip: (ws: string) => string[]; storedStrip: (ws: string, space: string) => TaskTab[]; t: (clave: string, datos?: Record<string, string | number>) => string; taskSources: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Source[] | null>; topState: (tasks: import("../../../../shell/src/shell/attention").TaskAttention[]) => import("../../../../shell/src/shell/attention").AttentionState | null; withLastAnswer: < T>(machine: string | null, key: string, call: () => Promise< T>) => Promise< T>; workspaceActivo: import("solid-js").Accessor<string | null>; workspaceContext: { active: import("solid-js").Accessor<string | null>; mode: import("solid-js").Accessor<string | null>; root: import("solid-js").Accessor<string | null>; confirmed: import("solid-js").Accessor<boolean>; generation: () => number; beginTransition: (startup: { active: string | null; workspaces: { id: string; context_root: string | null; default_permission_mode: string | null; }[]; }) => Readonly<{ generation: number; material: number; }> & Readonly<{ previous: string | null; workspace: string | null; }>; activate: (token: Readonly<{ generation: number; material: number; }> & Readonly<{ previous: string | null; workspace: string | null; }>) => boolean; beginMaterial: () => Readonly<{ generation: number; material: number; }>; current: (token: Readonly<{ generation: number; material: number; }>) => boolean; currentMaterial: (token: Readonly<{ generation: number; material: number; }>) => boolean; confirmContext: (token: Readonly<{ generation: number; material: number; }>, candidate: string | null, listed: { id: string; root: boolean; missing: boolean; }[]) => "obsolete" | "unavailable" | "accepted"; modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void; dispose: () => void; }; workspaceMode: import("solid-js").Accessor<string | null> } & { _bridge: Record<string, any>; _live: Record<string, () => any> }) {
  const _bridge = deps._bridge;
  const _mk = (read: () => any): any => new Proxy(function () {} as any, { get(_t: any, p: any) { return read()[p]; }, apply(_t: any, _th: any, args: any[]) { return read()(...args); } });
  const _late: any = {};
  for (const [n, via] of [["irAlBlanco",1],["refreshSessions",1],["composerMachine",0],["liveThreads",0],["serviceStream",0],["vivas",0]] as [string, 0 | 1][]) _late[n] = _mk(() => via ? _bridge[n] : deps._live[n]());
  const { irAlBlanco, refreshSessions, composerMachine, liveThreads, serviceStream, vivas } = _late;
  const { abrirSesion, activarPestana, activeSpace, adjuntosEn, appendToStoredStrip, attention, batch, carpetasDelEscritorio, claveDeBorrador, connected, conservar, createComposerStore, createDraftsStore, createEffect, createMemo, createSignal, createThreadsStore, deLaTarea, deleteLayout, deleteStoredStrip, enMaquina, esProvisional, escribirPref, escritorio, escritorioDeFila, filaDe, grupos, hablandoCon, invoke, isTaskTab, leerPref, loadWindowThreads, machineOf, machines, migrateLegacyStrip, modeloDeSubtarea, naciendo, olvidarPestana, on, onCleanup, paneles, pegadasEn, pestanaActiva, pestanas, project, projectList, prosaDe, readLayout, sesiones, sessionId, setBuscando, setError, setEscritorio, setProyectoAbierto, setSpaces, spaceName, spaces, spacesWithLayout, spacesWithStoredStrip, storedStrip, t, taskSources, topState, withLastAnswer, workspaceActivo, workspaceContext, workspaceMode } = deps;
  /** El panel conserva workspace y conversación; el título pertenece a la tira. */
  const tareasEnVentanas = createMemo<(Pick<TaskTab, "id" | "session"> & { workspace: string | null })[]>((previous) =>
    conservar(previous ?? [], pestanas.open().filter(isTaskTab).map(({ id, session }) =>
      ({ id, session, workspace: workspaceActivo() })), (p) => p.id),
  );
  const proyectoDePestana = (id: string) => pestanas.open().find(tab => tab.id === id)?.project ?? "";
  /** Las tareas con pestaña: la lista viva las trae aunque estén archivadas. */
  const sesionesConPestana = createMemo(
    () =>
      [...new Set(pestanas.open().map((p) => p.session))]
        .filter((id) => id !== "" && !esProvisional(id))
        .sort(),
    [],
    { equals: (a, b) => a.length === b.length && a.every((id, i) => id === b[i]) },
  );
  /** Los agentes de las tareas con pestaña: Configuración abre desplegados sus proveedores. */
  const agentesEnUso = () => {
    const abiertas = new Set(sesionesConPestana());
    const agentes = new Set<string>();
    for (const filas of Object.values(sesiones())) {
      for (const fila of filas) if (abiertas.has(fila.id)) agentes.add(fila.provider);
    }
    return [...agentes];
  };
  // Qué pestañas viajaron en la última lectura de cada grupo: la que se abrió
  // después aún no tiene fila, y eso no dice que la tarea ya no exista.
  const pedidas = new Map<string, Set<string>>();
  const sinPedir = (id: string) => grupos().some((g) => !pedidas.get(g)?.has(id));
  const enLista = (id: string) =>
    naciendo().some((n) => n.row.id === id) ||
    Object.values(sesiones()).some((filas) => filas.some((r) => r.id === id));
  // Una relectura por pestaña sin fila hasta que una lectura la lleve: si falla, no se repite en bucle.
  const esperandoFila = new Set<string>();
  function pedirFilasQueFaltan() {
    const faltan = sesionesConPestana().filter((id) => !enLista(id) && sinPedir(id) && !esperandoFila.has(id));
    if (faltan.length === 0) return;
    for (const id of faltan) esperandoFila.add(id);
    void refreshSessions(grupos());
  }
  createEffect(
    on(
      sesionesConPestana,
      () => {
        if (grupos().every((grupo) => grupo in sesiones())) pedirFilasQueFaltan();
      },
      { defer: true },
    ),
  );
  // Podar antes de cargar todos los grupos cerraría pestañas válidas al arrancar.
  // Archivar cierra la pestaña que se vio viva.
  let vivasVistas = new Set<string>();
  createEffect(
    on([sesiones, grupos, escritorio, spaces], ([lista, g, desk, todas]) => {
      if (!g.every((grupo) => grupo in lista)) return;
      const delanteAntes = pestanaActiva();
      const fuera = pestanas.sync((id) => {
        for (const [grupo, filas] of Object.entries(lista)) {
          const fila = filas.find((r) => r.id === id);
          if (fila) return fila.archived === true && vivasVistas.has(id) ? null : { project: grupo, titulo: fila.title };
        }
        const suya = (sinPedir(id) || naciendo().some((n) => n.row.id === id)) && pestanas.open().find((p) => p.session === id);
        return suya ? { project: suya.project, titulo: "" } : null;
      });
      vivasVistas = new Set(
        Object.values(lista)
          .flat()
          .filter((r) => r.archived !== true)
          .map((r) => r.id),
      );
      pedirFilasQueFaltan();
      fuera.forEach(soltarHilo);
      fuera.forEach(drafts.drop);
      for (const id of fuera) olvidarPestana(id);
      // Archivar (o borrar) la tarea de delante deja la conversación en
      // blanco: el panel pondría la pestaña vecina, y quien archiva acabó
      // con esa tarea, no pidió abrir otra.
      if (delanteAntes !== null && !pestanas.open().some((p) => p.id === delanteAntes)) {
        irAlBlanco(carpetaDelEscritorio(project()));
      }
      // Una tarea que se movió a otro espacio se lleva su pestaña a esa tira.
      if (!desk) return;
      const ajenas: { p: TaskTab; a: string }[] = [];
      for (const p of pestanas.open()) {
        if (!isTaskTab(p)) continue;
        const fila = Object.values(lista).flat().find((r) => r.id === p.session);
        const a = escritorioDeFila(fila, todas);
        if (a && a !== desk) ajenas.push({ p, a });
      }
      if (ajenas.length > 0) reubicarPestanas(ajenas);
    }),
  );

  /** Saca pestañas de esta tira hacia la guardada de su escritorio, sin olvidar lo leído. */
  function reubicarPestanas(ajenas: { p: TaskTab; a: string }[]) {
    const ws = workspaceActivo();
    if (!ws) return;
    for (const { p, a } of ajenas) appendToStoredStrip(ws, a, { id: p.id, project: p.project, titulo: p.titulo });
    const activaAntes = pestanaActiva();
    const vecina = pestanas.closeMany(ajenas.map(({ p }) => p.id));
    paneles.sync(pestanas.open().map((x) => x.id));
    if (activaAntes === null || pestanas.open().some((x) => x.id === activaAntes)) return;
    if (vecina) void activarPestana(vecina);
    else irAlBlanco(carpetaDelEscritorio(project()));
  }

  /**
   * Cambia la tira y el riel a otro escritorio. Las pestañas del que se deja
   * no se cierran: sus lecturas siguen hasta que su pestaña se cierre en su tira.
   */
  function cambiarEscritorio(id: string, restaurarActiva = true) {
    const ws = workspaceActivo();
    if (!ws || id === escritorio() || !spaces().some((i) => i.id === id)) return;
    const restored = batch(() => {
      setEscritorio(id);
      escribirPref(`space.${ws}`, id);
      // El reparto del que se deja ya está guardado por cada cambio suyo; aquí
      // se corta, para no escribir el del que llega bajo la clave del otro.
      paneles.bindTo(null, null);
      const r = pestanas.load(ws, id);
      // En el mismo lote: una pestaña sin ventana se monta escondida, gasta su
      // lectura sin caja y reabre al final (`montadas`).
      const vivos = pestanas.open().map((x) => x.id);
      paneles.restore(readLayout(ws, id), vivos);
      paneles.sync(vivos);
      paneles.bindTo(ws, id);
      if (r) paneles.activate(r);
      setProyectoAbierto(null);
      return r;
    });
    // Las demás ventanas del reparto que vuelve cargan su tarea, para que la
    // rejilla vuelva enseñando lo que tenía. La de delante la abre lo de abajo.
    loadWindowThreads(restored);
    if (!restaurarActiva) return;
    const p = restored ? pestanas.open().find((x) => x.id === restored) : undefined;
    if (p) void abrirSesion(p.project, p.id);
    else irAlBlanco(carpetaDelEscritorio(project()));
  }

  /** Una carpeta de este escritorio para la caja vacía: la pedida si es suya, si no la primera visible. */
  function carpetaDelEscritorio(pedido: string) {
    const desk = activeSpace();
    if (!desk) return pedido;
    const visibles = carpetasDelEscritorio(projectList(), desk, sesiones());
    if (visibles.some((p) => p.id === pedido)) return pedido;
    return visibles[0]?.id ?? pedido;
  }

  /** Lo que la ventana guarda de una pestaña que ya no va a volver. */
  function soltarPestanaGuardada(id: string) {
    drafts.drop(id);
    olvidarPestana(id);
    if (!vivas().includes(id)) soltarHilo(id);
  }

  function podarTirasMuertas(ws: string, lista: Space[]) {
    // También el reparto: un espacio con rejilla guardada y sin tira —nadie
    // abrió una pestaña— no lo alcanzaría `escritoriosConTira`.
    const conAlgo = new Set([...spacesWithStoredStrip(ws), ...spacesWithLayout(ws)]);
    for (const id of conAlgo) {
      if (lista.some((i) => i.id === id)) continue;
      for (const p of storedStrip(ws, id)) soltarPestanaGuardada(p.id);
      deleteStoredStrip(ws, id);
      deleteLayout(ws, id);
    }
  }

  /** Qué escritorio abre este workspace: el último que se usó si sigue vivo, o la primera. */
  function asentarEscritorio(ws: string, lista: Space[] | null): string | null {
    if (!lista || lista.length === 0) {
      batch(() => {
        setSpaces([]);
        setEscritorio(null);
      });
      return null;
    }
    migrateLegacyStrip(ws, lista[0].id);
    const guardado = leerPref<string | null>(`space.${ws}`, null);
    const desk = guardado && lista.some((i) => i.id === guardado) ? guardado : lista[0].id;
    podarTirasMuertas(ws, lista);
    batch(() => {
      setSpaces(lista);
      setEscritorio(desk);
    });
    return desk;
  }

  async function reloadSpaces() {
    const ws = workspaceActivo();
    if (!ws) return;
    try {
      const lista = await invoke<Space[]>("list_spaces");
      if (ws !== workspaceActivo() || escritorio() === null) return;
      setSpaces(lista);
      if (!lista.some((i) => i.id === escritorio()) && lista[0]) cambiarEscritorio(lista[0].id);
      podarTirasMuertas(ws, lista);
    } catch {
      // La lista de antes sigue sirviendo hasta el siguiente aviso.
    }
  }

  /** El aviso de lo que un gesto sobre espacios acaba de hacer, con su «Ir». */
  const [aviso, setAviso] = createSignal<{ texto: string; boton?: string; ir?: () => void } | null>(null);
  const [deletingSpace, setDeletingSpace] = createSignal<string | null>(null);
  const replaceSpace = (i: Space) =>
    setSpaces((lista) => lista.map((x) => (x.id === i.id ? i : x)));

  async function createSpace(name: string, folders: string[]) {
    const nueva = await invoke< Space>("create_space", { name, folders });
    setSpaces((lista) => [...lista.filter((i) => i.id !== nueva.id), nueva]);
    cambiarEscritorio(nueva.id);
  }

  async function renameSpace(id: string, name: string) {
    try {
      replaceSpace(await invoke< Space>("rename_space", { id, name }, machineOf(id)));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function updateSpaceFolders(id: string, folders: string[]) {
    replaceSpace(await invoke< Space>("set_space_folders", { id, folders }, machineOf(id)));
  }

  async function removeFromActiveSpace(folder: string) {
    const i = activeSpace();
    if (!i) return;
    try {
      await updateSpaceFolders(i.id, i.folders.filter((f) => f !== folder));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  async function moveToSpace(project: string, id: string, space: string) {
    try {
      // A la máquina de la tarea: el router comparte antes con la cuenta el
      // space de esta ventana y allá se crea con el mismo id.
      // Con la máquina de la tarea apagada el relay lo aplaza y no hay respuesta del motor: el space es el pedido.
      const destino = (await invoke<{ id: string; name: string | null } | null>("move_task_to_space", { project, id, space }, deLaTarea(id)))
        ?? spaces().find((i) => i.id === space) ?? null;
      await refreshSessions(grupos());
      setAviso({
        texto: t("spaces.move.toast", { name: spaceName(destino) }),
        boton: t("spaces.toast.go"),
        ir: () => void abrirSesion(project, id),
      });
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  /** Borrada: sale de la barra, su tira se olvida y el aviso abre sus archivadas en el buscador. */
  function spaceDeleted(i: Space, archivadas: number) {
    const ws = workspaceActivo();
    setDeletingSpace(null);
    if (!ws) return;
    const quedan = spaces().filter((x) => x.id !== i.id);
    if (escritorio() === i.id && quedan[0]) cambiarEscritorio(quedan[0].id);
    setSpaces(quedan);
    for (const p of storedStrip(ws, i.id)) soltarPestanaGuardada(p.id);
    deleteStoredStrip(ws, i.id);
    window.dispatchEvent(new CustomEvent("harness:tasks-changed"));
    void reloadSpaces();
    setAviso({
      texto: t("spaces.delete.toast", { name: spaceName(i), count: archivadas }),
      boton: t("spaces.delete.see_archived"),
      ir: () => setBuscando("archived"),
    });
  }

  /** Lo más urgente de las tareas de un escritorio; con `sinResolver`, también las que se pintan en todos. */
  const senalDe = (desk: string, sinResolver = false) =>
    topState(
      attention.of(workspaceActivo()).filter((a) => {
        const r = filaDe(a.session);
        return !!r && (r.space === desk || (sinResolver && !r.space));
      }),
    );

  const claveDelHilo = () => sessionId() ?? "";
  const claveAbierta = () => claveDeBorrador(sessionId(), project(), hablandoCon()?.project === project() ? hablandoCon()?.name : null);
  const drafts = createDraftsStore({
    key: claveAbierta, workspace: workspaceActivo, generation: workspaceContext.generation,
    project, projects: projectList, sources: taskSources,
    prepareAttachments: async (paths, project) => {
      const machine = paths.length ? pegadasEn.get(paths[0]) : undefined;
      const routed = machine && paths.every(path => pegadasEn.get(path) === machine) ? enMaquina(machine) : undefined;
      const workspace = workspaceActivo();
      const options = { headers: { ...routed?.headers, ...(workspace ? { "x-terminus-workspace": workspace } : {}) } };
      const prepared = await invoke<string[]>("prepare_attachments", { project, paths }, options);
      if (machine) for (const path of prepared) adjuntosEn.set(path, machine);
      return prepared;
    },
  });
  onCleanup(drafts.dispose);
  const borrador = drafts.current;
  const input = drafts.input;
  const setInput = drafts.changeText;
  const navigateMentionHistory = drafts.history;
  const sourceIds = drafts.sourceIds;
  const excludedSourceIds = drafts.excludedSourceIds;
  const archivos = drafts.files;
  const setArchivos = drafts.replaceFiles;
  const agregarArchivos = drafts.addFiles;
  const adjuntas = drafts.attached;
  const materialPendiente = drafts.pendingMaterial;
  const contexto = drafts.context;

  const composer = createComposerStore({
    invoke, withLastAnswer,
    scope: { workspace: workspaceActivo, machine: () => composerMachine(),
      machineOn: () => machines().find(machine => machine.id === composerMachine())?.on,
      connected, session: () => sessionId() },
    workspaceMode, draftConfiguration: () => borrador().configuration,
  });
  const { agents, agent, superficies, superficie, catalogos, models, modelosParaAgentes,
    model, effort, modo, modos, skills, cliCommands, sideCommand } = composer;
  onCleanup(composer.dispose);
  const threads = createThreadsStore({
    scope: { workspace: workspaceActivo, generation: workspaceContext.generation, paged: () => serviceStream.paged() },
    activeSession: sessionId, project, invoke, route: deLaTarea, liveThreads: () => liveThreads,
  });
  onCleanup(threads.dispose);
  const hilos = threads.rows, hiloAbierto = threads.current, msgs = threads.messages, cargandoHilo = threads.loading;
  const origenes = threads.origins, apagadas = threads.offline, machineWaits = threads.machineWaits, traspasos = threads.handovers;
  const conAntiguos = threads.olderAvailable, conRecientes = threads.recentAvailable, estadoAntiguos = threads.olderStatus, colaSuelta = threads.recentTail;
  const leerTarea = threads.read, cargarAntiguos = threads.older, soltarHilo = threads.drop;
  function avisar(sesion: string) {
    return (e: unknown) => threads.appendLive(sesion, [{ role: "system", text: prosaDe(e), meta: "aviso" }]);
  }
  function loadResult(id: string, session: Session, clear: boolean, generation: number) {
    if (!threads.acceptSession(id, session, clear, generation)) return;
    drafts.invalidateProvider(id, session.provider);
    if (id === sessionId() && (session.subagent || session.parent)) composer.useProfile({ model: modeloDeSubtarea(session), effort: session.effort });
  }
  const _out = { tareasEnVentanas, proyectoDePestana, sesionesConPestana, agentesEnUso, pedidas, esperandoFila, cambiarEscritorio, carpetaDelEscritorio, asentarEscritorio, reloadSpaces, aviso, setAviso, deletingSpace, setDeletingSpace, createSpace, renameSpace, removeFromActiveSpace, moveToSpace, spaceDeleted, senalDe, claveDelHilo, claveAbierta, drafts, borrador, input, setInput, navigateMentionHistory, sourceIds, excludedSourceIds, archivos, setArchivos, agregarArchivos, adjuntas, materialPendiente, contexto, composer, agents, agent, superficies, superficie, catalogos, models, modelosParaAgentes, model, effort, modo, modos, skills, cliCommands, sideCommand, threads, hilos, hiloAbierto, msgs, cargandoHilo, origenes, apagadas, machineWaits, traspasos, conAntiguos, conRecientes, estadoAntiguos, colaSuelta, leerTarea, cargarAntiguos, soltarHilo, avisar, loadResult };
  Object.assign(_bridge, _out);
  return _out;
}
