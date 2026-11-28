import { createEffect, createMemo, createResource, createSignal, on, type Accessor } from "solid-js";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { asFailure } from "../../../../ui/src/Failure";
import { lastRoster, rememberRoster } from "../../../../ui/src/lib/handlerRoster.ts";
import { t } from "../../../../ui/src/lib/i18n";
import { type MentionSources } from "../../../../ui/src/lib/mentions";
import { type HandlerDefinition, type HandlerList, type HandlerStatusRow, type Project } from "../../../../ui/src/lib/model";
import { recipientCandidatesOf, type RecipientCandidate } from "../../../../ui/src/lib/recipients";
import { alHilo } from "../../../../ui/src/lib/side-question";
import { type PlaceCandidate, type TaskCandidate, type TextEdit } from "../../../../ui/src/lib/taskMentions";
import { type AlMargen } from "../components/SideQuestion";
import type { SessionRow, WatchProfilesPort } from "./types.ts";

export type ThreadMentionsDeps = {
  deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string } } | undefined;
  input: () => string;
  project: Accessor<string>;
  projectList: Accessor<Project[]>;
  sesiones: Accessor<Record<string, SessionRow[]>>;
  sessionId: Accessor<string | null>;
  setInput: (value: string, inputType?: string, change?: TextEdit) => void;
  watchHandlerStatuses: (project: string) => () => HandlerStatusRow[];
  watchProfiles: WatchProfilesPort;
  workspaceActivo: Accessor<string | null>;
};

/** Pregunta al margen y candidatos del menú `@` (tareas, carpetas y encargados del proyecto). */
export function createThreadMentions(deps: ThreadMentionsDeps) {
  const { deLaTarea, input, project, projectList, sesiones, sessionId, setInput, watchHandlerStatuses, watchProfiles, workspaceActivo } = deps;

  // La pregunta al margen vive en memoria y es de una tarea: al cambiar de
  // tarea se pierde, y la respuesta que llegue tarde no se pinta en otra.
  const [alMargen, setAlMargen] = createSignal<AlMargen | null>(null);
  let preguntasAlMargen = 0;
  createEffect(on(sessionId, (id) => {
    if (alMargen() && alMargen()?.session !== id) cerrarAlMargen();
  }));
  function cerrarAlMargen() {
    preguntasAlMargen++;
    setAlMargen(null);
  }
  async function preguntarAlMargen(question: string) {
    const session = sessionId();
    const turno = ++preguntasAlMargen;
    if (!session) {
      setAlMargen({ session: "", question, answer: null, failure: { what: { clave: "chat.side.error.no_session" }, detail: "" } });
      return;
    }
    setAlMargen({ session, question, answer: null, failure: null });
    const vigente = () => turno === preguntasAlMargen && sessionId() === session;
    try {
      const { answer } = await callEngine<{ answer: string }>("ask_side_question", { project: project(), session, question }, deLaTarea(session));
      if (vigente()) setAlMargen({ session, question, answer, failure: null });
    } catch (e) {
      if (vigente()) setAlMargen({ session, question, answer: null, failure: asFailure(e) });
    }
  }
  function pasarAlHilo() {
    const m = alMargen();
    if (!m?.answer) return;
    const texto = t("chat.side.thread_text", { question: m.question, answer: m.answer });
    setInput(alHilo(input(), texto));
    cerrarAlMargen();
  }

  // Lo que se puede mencionar. Sale de las fuentes que ESTA tarea tiene
  // adjuntas y solo de ellas: la frontera de lo mencionable es la del agente.
  const [mentionSources, setMentionSources] = createSignal<MentionSources | null>(null);
  const [taskCandidates, setTaskCandidates] = createSignal<TaskCandidate[]>([]);
  let taskCandidateRequest = 0;
  const refreshTaskCandidates = async () => {
    const request = ++taskCandidateRequest;
    const workspace = workspaceActivo();
    const session = sessionId();
    try {
      const items = await callEngine<TaskCandidate[]>("list_task_mentions");
      if (request === taskCandidateRequest && workspace === workspaceActivo() && session === sessionId()) setTaskCandidates(items);
    } catch {
      if (request === taskCandidateRequest) setTaskCandidates([]);
    }
  };
  /**
   * Los encargados de la carpeta abierta, para el menú de `@`. Sale de la
   * misma llamada que el riel ya hace, y el último listado conocido cubre la
   * lectura que falle: mejor el nombre de ayer que un menú sin encargados.
   */
  const [rosterDelProyecto] = createResource(project, async (id) => {
    if (!id) return [] as HandlerDefinition[];
    try {
      const listado = (await callEngine<HandlerList>("list_agents", { project: id })).agents;
      rememberRoster(id, listado);
      return listado;
    } catch {
      return lastRoster(id) ?? [];
    }
  });
  /**
   * La presencia sigue a la carpeta abierta: suscribirse a una fija dejaría
   * las caras del proyecto anterior. Misma forma que `watchHandlerStatus`.
   */
  const [presenciaDeEncargados, setPresenciaDeEncargados] = createSignal<HandlerStatusRow[]>([]);
  createEffect(() => {
    const id = project();
    if (!id) {
      setPresenciaDeEncargados([]);
      return;
    }
    const filas = watchHandlerStatuses(id);
    createEffect(() => setPresenciaDeEncargados(filas()));
  });
  // Los ocultos salen del menú como salen del riel; sin carpeta no hay perfiles que leer.
  const perfilesDeLaCarpeta = createMemo(() => {
    const id = project();
    return id ? watchProfiles(id) : () => ({});
  });
  const recipientCandidates = createMemo<RecipientCandidate[]>(() =>
    recipientCandidatesOf(rosterDelProyecto() ?? lastRoster(project()) ?? [], {
      profiles: perfilesDeLaCarpeta()(),
      // `undefined` no es un estado: es que todavía no se sabe, y el menú
      // pinta la cara despierta en vez de inventar que duerme.
      statuses: presenciaDeEncargados(),
    }),
  );
  const placeCandidates = createMemo<PlaceCandidate[]>(() =>
    projectList().map((f) => ({ target: { kind: "folder" as const, projectId: f.id }, name: f.name, detail: "", updatedAt: f.updated_at })),
  );
  createEffect(on([workspaceActivo, sessionId, sesiones], () => {
    taskCandidateRequest++;
    setTaskCandidates([]);
    if (input().includes("@")) void refreshTaskCandidates();
  }));

  return {
    alMargen,
    cerrarAlMargen,
    mentionSources,
    pasarAlHilo,
    placeCandidates,
    preguntarAlMargen,
    recipientCandidates,
    refreshTaskCandidates,
    rosterDelProyecto,
    setMentionSources,
    taskCandidates,
  };
}
