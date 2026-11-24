import { t } from "../../../../apps/desktop/src/lib/i18n";
import { type Agent, type Project } from "../../../../apps/desktop/src/lib/model.ts";
import { type CatalogosDeModelos, type OpcionDeModelo } from "../../../../apps/desktop/src/lib/models.ts";
import { type Layout, type PanelGroup, type PanelSite as SitioDePanel, type Side as PanelSide } from "../../../ui/src/lib/panels-types.ts";
import { type Space } from "../../../../apps/desktop/src/lib/spaces.ts";
import { type Superficie } from "../../../../apps/desktop/src/lib/surfaces.ts";
import { isTaskTab } from "../../../../apps/desktop/src/lib/tabs";
import { type ContentTab, type FileTab, type Tab } from "../../../ui/src/lib/tabs-types.ts";
import { type createSendGates as T_createSendGates, type createThreadSide as T_createThreadSide } from "../../../features/chat/src";
import { apagarVistasDe } from "../../../features/code/src/queries/typst";
import { type CarryCheck } from "../../../features/machines/src/queries/carry.ts";
import { machineName, machines, runOn } from "../../../features/machines/src/queries/store";
import { type createWorkspaceSession as T_createWorkspaceSession } from "../../../features/projects/src";
import { type DeleteTarget } from "../../../features/projects/src/queries/deleteTask.ts";
import AnadirCarpeta from "../../../features/projects/src/screens/AddWorkdir";
import { type ClonEnCurso } from "../../../features/projects/src/screens/AddWorkdir.tsx";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions.tsx";
import { type AttentionStore } from "../../../features/projects/src/screens/workspace-session.ts";
import McpSignInNotice from "../../../features/settings/src/screens/McpSignInNotice";
import { UnsavedCloseDialog } from "../../../features/tabs/src";
import { type ActivityEvent } from "../../../engine-client/src/activity.ts";
import { Button } from "../../../ui/src/Button";
import { Toast, ToastStack } from "../../../ui/src/Toast";
import CloseGuard from "../shell/CloseGuard";
import AvisoDeCarpeta from "../shell/FolderNotice";
import AvisoDeMaterial from "../shell/MaterialNotice";
import TaskNotifier from "../shell/TaskNotifier";
import AvisoDeVersion from "../shell/VersionNotice";
import { CarrySheet, DeleteSpace, DeleteTaskDialog, HandoverDialog, Integraciones, Settings } from "./lazy-screens";
import { Show, Suspense, batch, type Accessor, type JSX, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type PrincipalDeps = { ColumnasDePrincipal: () => JSX.Element; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; activityNotice: Accessor<ActivityEvent | null>; agentesEnUso: () => string[]; agents: Accessor<Agent[]>; anadiendoCarpeta: Accessor<boolean>; archivos: () => string[]; attention: AttentionStore; aviso: Accessor<{ texto: string; boton?: string; ir?: () => void; } | null>; carryModule: ReturnType<typeof T_createSendGates>["carryModule"]; cerrarAjustes: () => void; cierreSinGuardar: Accessor<{ ids: string[]; archivos: string[]; sucios: string[]; } | null>; claveAbierta: () => string; confirmarTraspaso: () => void; connectionError: Accessor<string | null>; deleteTarget: Accessor<DeleteTarget | null>; deletedTaskMembers: (members: { project: string; id: string; }[]) => void; deletingSpace: Accessor<string | null>; despuesDeTraer: Map<string, "continue" | "branch">; dirtyTaskFiles: (id: string) => string[]; draftProjectError: Accessor<string | null>; errorVisible: () => string | null; escritorio: Accessor<string | null>; filaDe: (id: string) => SessionRow | undefined; hojaDeLlevar: Accessor<{ key: string; check: CarryCheck; busy?: boolean; } | null>; imagenDeVentana: () => string | null; inicioDeCarpeta: ReturnType<typeof T_createThreadSide>["inicioDeCarpeta"]; mandar: (attachments: string[]) => Promise<boolean>; modelosParaAgentes: Accessor<{ superficies: Superficie[]; catalogos: CatalogosDeModelos; }>; nuevaSesion: (enProyecto?: string) => void; openAgentProfile: (enProyecto: string, name: string) => void; paneles: { columns: Accessor<PanelGroup[][]>; widths: Accessor<number[]>; heights: Accessor<number[]>; rowCount: () => number; activeSite: Accessor<SitioDePanel>; sites: () => SitioDePanel[]; siteOf: (id: string) => SitioDePanel | null; groupAt: (site: SitioDePanel) => PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: SitioDePanel) => string[]; activeTabAt: (site: SitioDePanel) => string | null; isVisible: (id: string) => boolean; focus(site: SitioDePanel): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move: (id: string, a: SitioDePanel, index?: number) => boolean; split: (id: string) => boolean; canSplitAt: (id: string, reference: SitioDePanel, side: PanelSide, unplaced?: boolean) => boolean; splitAt: (id: string, reference: SitioDePanel, side: PanelSide) => boolean; join: () => boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => Layout; restore(layout: Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles: (project: string, session: string, tree: string) => [string, string][]; renameFiles: (session: string, tree: string, from: string, end: string) => [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged: (id: string) => void; dirty: Accessor<ReadonlySet<string>>; setDirty: (id: string, dirty: boolean) => void; registerSaver: (id: string, save: (() => Promise<boolean>) | null) => void; dirtyTabsToClose: (ids: string | readonly string[]) => FileTab[]; saveFiles: (ids: string[]) => Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; project: Accessor<string>; projectCatalog: ReturnType<typeof T_createWorkspaceSession>["projectCatalog"]; projectList: Accessor<Project[]>; projectReadError: Accessor<string | null>; proyectoAbierto: Accessor<string | null>; recargarMaterial: () => Promise<void>; refreshSessions: (proyectos: string[]) => Promise<void>; reloadSpaces: () => Promise<void>; resolverCierre: (decision: "guardar" | "descartar") => Promise<void>; retryStartupRead: () => Promise<void>; sessionId: Accessor<string | null>; setActivityNotice: Setter<ActivityEvent | null>; setAnadiendoCarpeta: Setter<boolean>; setAviso: Setter<{ texto: string; boton?: string; ir?: () => void; } | null>; setCierreSinGuardar: Setter<{ ids: string[]; archivos: string[]; sucios: string[]; } | null>; setClonEnCurso: Setter<ClonEnCurso | null>; setDeleteTarget: Setter<DeleteTarget | null>; setDeletingEditors: Setter<{ workspace: string | null; ids: string[]; } | null>; setDeletingSpace: Setter<string | null>; setDraftProjectError: Setter<string | null>; setError: Setter<string | null>; setHojaDeLlevar: Setter<{ key: string; check: CarryCheck; busy?: boolean; } | null>; setInicioDeCarpeta: ReturnType<typeof T_createThreadSide>["setInicioDeCarpeta"]; setProjectReadError: Setter<string | null>; setReadRevision: Setter<number>; setStartupReadError: Setter<string | null>; setTraspasoPendiente: Setter<{ clave: string; sesion: string; desde: string; opcion: OpcionDeModelo; } | null>; settings: Accessor<string | null>; spaceDeleted: (i: Space, archivadas: number) => void; spaces: Accessor<Space[]>; startupReadError: Accessor<string | null>; traer: (key: string) => Promise<void>; traspasoPendiente: Accessor<{ clave: string; sesion: string; desde: string; opcion: OpcionDeModelo; } | null>; veloDeVentana: () => number; ventanas: () => SitioDePanel[]; workspaceActivo: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2857–3067, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createPrincipal(deps: PrincipalDeps) {
  const { ColumnasDePrincipal, abrirSesion, activityNotice, agentesEnUso, agents, anadiendoCarpeta, archivos, attention, aviso, carryModule, cerrarAjustes, cierreSinGuardar, claveAbierta, confirmarTraspaso, connectionError, deleteTarget, deletedTaskMembers, deletingSpace, despuesDeTraer, dirtyTaskFiles, draftProjectError, errorVisible, escritorio, filaDe, hojaDeLlevar, imagenDeVentana, inicioDeCarpeta, mandar, modelosParaAgentes, nuevaSesion, openAgentProfile, paneles, pestanas, project, projectCatalog, projectList, projectReadError, proyectoAbierto, recargarMaterial, refreshSessions, reloadSpaces, resolverCierre, retryStartupRead, sessionId, setActivityNotice, setAnadiendoCarpeta, setAviso, setCierreSinGuardar, setClonEnCurso, setDeleteTarget, setDeletingEditors, setDeletingSpace, setDraftProjectError, setError, setHojaDeLlevar, setInicioDeCarpeta, setProjectReadError, setReadRevision, setStartupReadError, setTraspasoPendiente, settings, spaceDeleted, spaces, startupReadError, traer, traspasoPendiente, veloDeVentana, ventanas, workspaceActivo } = deps;
  const Principal = () => (
    // UNA superficie continua, no tres tarjetas flotando: las columnas
    // pegan con el chat y se separan con hairline y divisor arrastrable
    // (shells → surfaces → components).

    // Continua no quiere decir de un solo tono: los rieles llevan `bg`
    // y el chat `surface` (`ColumnaLateral`), y lo que la regla prohíbe
    // —hueco, sombra, esquina redondeada— sigue prohibido.

    // Sin cabecera y sin título de app, como Claude: la ventana ya se
    // llama Terminus.
    <div
      class="relative isolate flex h-full flex-col overflow-hidden bg-surface"
      // `.tab-active` repite este fondo dentro de la pestaña para fundirse con su panel.
      style={{
        "--window-image": imagenDeVentana() ? `url("${imagenDeVentana()}")` : "none",
        "--window-veil": String(veloDeVentana()),
      }}
    >
      <CloseGuard title={(id) => filaDe(id)?.title} />
      <ToastStack>
        {/* Aquí y no en Configuración: ahí no entra nadie a buscar
            actualizaciones. El panel de «Estado del entorno» dice lo
            mismo para quien va a mirar; esto es para quien no va a ir. */}
        <AvisoDeVersion />
        {/* Debajo del de versión y con la misma forma: los dos son avisos
            que no interrumpen. Si coinciden, el de versión queda arriba:
            reiniciar afecta a lo que estés haciendo, y traer material no. */}
        <AvisoDeMaterial />
        <AvisoDeCarpeta project={project()} session={sessionId()} />
        <McpSignInNotice session={sessionId()} />
        <Show when={activityNotice()}>{notice => <Toast onDismiss={() => setActivityNotice(null)}>
          <div class="grid min-w-0 flex-1 gap-2">
          <p class="m-0 text-sm font-medium">{notice().title}</p>
          <p class="m-0 text-xs text-neutral-500">{t(`activity.state.${notice().state}`)} · {notice().machine ? machineName(notice().machine!) : t("activity.this_machine")}</p>
          </div>
        </Toast>}</Show>
        <TaskNotifier
          attention={attention.list()}
          workspace={workspaceActivo()}
          inView={(id) =>
            !proyectoAbierto() &&
            (id === sessionId() ||
              ventanas().some((sitio) => {
                const tab = pestanas.open().find((p) => p.id === paneles.activeTabAt(sitio));
                return !!tab && isTaskTab(tab) && tab.session === id;
              }))}
          title={(id) => filaDe(id)?.title}
          open={(project, id) => void abrirSesion(project, id)}
        />
        {/* Una lectura que falló va a la pila y no al riel: encima de «Nueva
            tarea» se quedaba fija tras un gesto fallido. La conexión no tiene
            cruz: se quita sola al volver el motor. */}
        <Show when={startupReadError() ?? draftProjectError() ?? projectReadError() ?? connectionError()}>{failure => {
          const lectura = () => !!(startupReadError() || draftProjectError() || projectReadError());
          return <Toast data-read-status="" onDismiss={lectura() ? () => { setStartupReadError(null); setDraftProjectError(null); setProjectReadError(null); } : undefined}>
            <Show when={lectura()}><p class="m-0 text-xs font-medium text-neutral-950">{t("shell.read.failed")}</p></Show>
            <Show when={!lectura() || failure() !== t("shell.service.failed")}><p class="m-0 break-words text-xs text-neutral-500">{failure()}</p></Show>
            <Show when={lectura()}><div><Button variant="outline" size="compact" onClick={() => {
              setReadRevision(n => n + 1);
              if (startupReadError()) void retryStartupRead();
              else if (!draftProjectError()) void recargarMaterial();
            }}>{t("common.part.retry")}</Button></div></Show>
          </Toast>;
        }}</Show>
        {/* El error del último gesto, y no caduca solo: uno que se va a los
            segundos no se llega a leer. Lo quita su cruz o el cambio de
            workspace. */}
        <Show when={errorVisible()}>
          {(e) => (
            <Toast data-toast-error="" tone="error" onDismiss={() => setError(null)}>
              <p class="m-0 break-words text-xs text-error-strong">{e()}</p>
            </Toast>
          )}
        </Show>
        <Show when={aviso()}>
          {(a) => (
            <Toast data-space-toast="" onDismiss={() => setAviso(null)}>
              <p class="m-0 break-words text-xs text-neutral-950">{a().texto}</p>
              <Show when={a().ir}>
                {(ir) => (
                  <div>
                    <Button variant="outline" size="compact" onClick={() => { setAviso(null); ir()(); }}>
                      {a().boton}
                    </Button>
                  </div>
                )}
              </Show>
            </Toast>
          )}
        </Show>
      </ToastStack>

      <Show when={spaces().find((i) => i.id === deletingSpace())}>
        {(i) => (
          <DeleteSpace
            space={i()}
            proyectos={projectList()}
            onCerrar={() => setDeletingSpace(null)}
            onAbrir={(folder, task) => {
              setDeletingSpace(null);
              void abrirSesion(folder, task);
            }}
            onEliminada={(n) => spaceDeleted(i(), n)}
            onTocadas={(folders) => void refreshSessions(folders)}
          />
        )}
      </Show>

      <Show when={deleteTarget()}>{target => (
        <DeleteTaskDialog target={target()} dirty={dirtyTaskFiles}
          prepare={async ids => { for (const id of ids) await apagarVistasDe(id); }}
          isCurrent={() => target().workspace === workspaceActivo()}
          lock={ids => setDeletingEditors(ids.length ? { workspace: target().workspace, ids } : null)}
          onDeleted={members => { if (target().workspace === workspaceActivo()) deletedTaskMembers(members); }}
          onClose={() => setDeleteTarget(null)} />
      )}</Show>

      <Show when={cierreSinGuardar()}>{(c) => (
        <UnsavedCloseDialog
          files={c().archivos}
          onCancel={() => setCierreSinGuardar(null)}
          onDiscard={() => void resolverCierre("descartar")}
          onSave={() => void resolverCierre("guardar")}
        />
      )}</Show>

      {/* El traspaso de proveedor se confirma una vez y se guarda como
          intento: viaja en el turno siguiente, no al elegir el modelo. */}
      <Show when={traspasoPendiente()}>{(pedido) => (
        <HandoverDialog
          from={agents().find((a) => a.id === pedido().desde)?.label ?? pedido().desde}
          to={agents().find((a) => a.id === pedido().opcion.agent)?.label ?? pedido().opcion.agent}
          onCancel={() => setTraspasoPendiente(null)}
          onConfirm={confirmarTraspaso}
        />
      )}</Show>

      {/* Sin workspace no hay carpeta donde escribir: aquí sí se tapa
          todo, riel incluido. Es la única pantalla que lo hace —el
          estado vacío de contexto se puede usar; esto no tiene dónde
          guardar nada. */}
      <ColumnasDePrincipal />


      <AnadirCarpeta machines={machines} runOn={runOn} machineName={machineName}
        abierto={anadiendoCarpeta()}
        workspace={workspaceActivo()}
        space={escritorio()}
        inicio={inicioDeCarpeta()}
        onClon={setClonEnCurso}
        onCerrar={() => batch(() => {
          setAnadiendoCarpeta(false);
          setInicioDeCarpeta(null);
        })}
        onHecho={async (p, activate) => {
          await projectCatalog.changed();
          // El backend ya la fijó en el escritorio desde el que se pidió: un
          // clon en segundo plano termina cuando la ventana puede mirar otro.
          await reloadSpaces();
          // Se sigue en «Nueva tarea» dentro de ella; su página queda a un clic en su nombre.
          if (activate) nuevaSesion(p.id);
        }}
      />

      <Show when={hojaDeLlevar()} keyed>
        {(hoja) => (
          <Suspense fallback={null}>
            <CarrySheet
              check={hoja.check}
              busy={hoja.busy}
              onCancel={() => setHojaDeLlevar(null)}
              onConfirm={(choice, state) => {
                const { key, check } = hoja;
                const mod = carryModule();
                mod?.planCarry(key, check, mod.jobFor(check, choice), state);
                setHojaDeLlevar(null);
                if (check.task) {
                  despuesDeTraer.set(key, choice.next);
                  void traer(key);
                } else if (claveAbierta() === key) void mandar(archivos());
              }}
            />
          </Suspense>
        )}
      </Show>

      {/* El nombre del workspace ya no se deduce de la ruta: lo lee el propio
          menú de la cabecera, que es quien sabe cuál está activo. */}

      <Show when={settings() !== null}>
        <Suspense fallback={null}>
          <Settings
            workspace={workspaceActivo()}
            panel={settings() || undefined}
            modelos={modelosParaAgentes()}
            proyecto={proyectoAbierto() ?? project()}
            agentesEnUso={agentesEnUso()}
            onClose={cerrarAjustes}
            integraciones={(p) => <Suspense fallback={null}><Integraciones {...p} /></Suspense>}
            onAgentProfile={(enProyecto, name) => {
              cerrarAjustes();
              openAgentProfile(enProyecto, name);
            }}
          />
        </Suspense>
      </Show>
    </div>
  );
  return { Principal };
}
