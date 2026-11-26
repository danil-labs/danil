import { batch, createEffect, createSignal, type Accessor } from "solid-js";
import { trimDraft } from "../../../ui/src/lib/recipients";
import { type OpcionDeModelo } from "../../../ui/src/lib/models.ts";
import { type TextEdit } from "../../../ui/src/lib/taskMentions.ts";
import { type Trigger } from "../../../ui/src/lib/mentions.ts";
import { type MentionTarget } from "../../../ui/src/lib/taskMentions.ts";
import { type SessionRow } from "../../../ui/src/lib/session-row.ts";
import { type ConversationScope } from "../../../ui/src/lib/handoff.ts";
import { type Msg } from "../../../features/chat/src/screens/Chat";
import { type RespuestaEnviada } from "../../../features/chat/src/components/Questions.tsx";
import { type createDeskStrip } from "../../../features/projects/src";
import { type createSend, type createThreadStream, type createHandover } from "../../../features/chat/src";

export type InlineComposerDeps = {
  agent: Accessor<string>;
  configDeLaSesion: ReturnType<typeof createHandover>["configDeLaSesion"];
  conversationScope: (id: string, projectId?: string) => ConversationScope;
  drafts: ReturnType<typeof createDeskStrip>["drafts"];
  effort: Accessor<string>;
  enviar: ReturnType<typeof createSend>["enviar"];
  escritorio: Accessor<string | null>;
  filaDe: (id: string) => SessionRow | undefined;
  handoff: ReturnType<typeof createThreadStream>["handoff"];
  hilos: ReturnType<typeof createDeskStrip>["hilos"];
  loadThread: (project: string, id: string) => Promise<void>;
  marcarQuieta: ReturnType<typeof createThreadStream>["marcarQuieta"];
  model: Accessor<string>;
  modo: Accessor<string>;
  reponerGates: (session: string) => Promise<void>;
  vivas: Accessor<string[]>;
  workspaceContext: { generation: () => number };
};

/**
 * Per-session independent composer controller for an inline subtask split thread.
 * Uses its own draft key, local model/effort/mode overrides, and targeted `destination` sends
 * so typing or sending in the subtask pane never mutates the main conversation composer.
 */
export function createInlineComposer(
  deps: InlineComposerDeps,
  target: { session: () => string; project: () => string; msgs: () => Msg[] },
) {
  const {
    agent, configDeLaSesion, conversationScope, drafts, effort, enviar,
    escritorio, filaDe, handoff, hilos, loadThread, marcarQuieta, model, modo, reponerGates,
    vivas, workspaceContext,
  } = deps;

  const [overrideProvider, setOverrideProvider] = createSignal<string | null>(null);
  const [overrideModel, setOverrideModel] = createSignal<string | null>(null);
  const [overrideEffort, setOverrideEffort] = createSignal<string | null>(null);
  const [overrideMode, setOverrideMode] = createSignal<string | null>(null);

  createEffect(() => {
    const id = target.session();
    const projectId = target.project();
    setOverrideProvider(null);
    setOverrideModel(null);
    setOverrideEffort(null);
    setOverrideMode(null);
    if (!id || !projectId) return;
    if (!hilos()[id]) {
      void loadThread(projectId, id);
    }
    void reponerGates(id);
  });

  const sessionConfig = () => {
    const id = target.session();
    return id ? configDeLaSesion(id) : { provider: agent(), model: model() || null, effort: effort() || null };
  };

  const inlineAgent = () => overrideProvider() ?? filaDe(target.session())?.provider ?? sessionConfig().provider ?? agent();
  const inlineModel = () => overrideModel() ?? sessionConfig().model ?? model();
  const inlineEffort = () => overrideEffort() ?? sessionConfig().effort ?? effort();
  const inlineModo = () => overrideMode() ?? modo();

  const borrador = () => drafts.draftFor(target.session());
  const input = () => borrador().input;
  const archivos = () => borrador().archivos;

  const setInput = (value: string, inputType?: string, change?: TextEdit) => {
    const id = target.session();
    if (id) drafts.changeTextAt(id, value, inputType, change);
  };
  const setArchivos = (files: string[]) => {
    const id = target.session();
    if (id) drafts.replaceFilesAt(id, files);
  };
  const agregarArchivos = async (paths: string[]) => {
    const id = target.session();
    const projectId = target.project();
    if (id && projectId) await drafts.addFilesAt(id, projectId, paths);
  };
  const navigateMentionHistory = (redo: boolean) => {
    const id = target.session();
    return id ? drafts.historyAt(id, redo) : false;
  };
  const onRecipient = (name: string, label: string, trigger: Trigger) => {
    const id = target.session();
    if (id) drafts.recipientAt(id, name, label, trigger);
  };
  const onReference = (mention: MentionTarget, label: string, trigger: Trigger) => {
    const id = target.session();
    if (id) drafts.referenceAt(id, mention, label, trigger);
  };
  const onModel = (opcion: OpcionDeModelo) => {
    setOverrideProvider(opcion.agent);
    setOverrideModel(opcion.model.id ?? "");
  };
  const onEffort = (value: string) => setOverrideEffort(value);
  const onModo = (value: string) => setOverrideMode(value);

  async function mandar(attachments: string[]): Promise<boolean> {
    const id = target.session();
    const projectId = target.project();
    if (!id || !projectId) return false;
    const current = borrador();
    const message = trimDraft({
      text: current.input,
      task_mentions: current.task_mentions,
      recipients: current.recipients,
    });
    if (!message.text && attachments.length === 0) return false;
    const generation = workspaceContext.generation();
    const sent = await batch(() => {
      drafts.changeTextAt(id, "");
      drafts.takeFiles(id, attachments);
      return enviar(
        {
          text: message.text,
          task_mentions: message.task_mentions,
          recipients: message.recipients,
          provider: inlineAgent(),
          model: inlineModel() || null,
          effort: inlineEffort() || null,
          permission_mode: inlineModo() || null,
          attachments,
          space: escritorio(),
        },
        undefined,
        { project: projectId, session: id },
      );
    });
    if (!sent && generation === workspaceContext.generation()) {
      drafts.restoreFailed(id, message, attachments);
    }
    return sent;
  }

  async function mandarTexto(texto: string): Promise<boolean> {
    const id = target.session();
    const projectId = target.project();
    if (!id || !projectId || !texto.trim()) return false;
    return enviar(
      {
        text: texto,
        provider: inlineAgent(),
        model: inlineModel() || null,
        effort: inlineEffort() || null,
        permission_mode: inlineModo() || null,
        attachments: [],
        space: escritorio(),
      },
      undefined,
      { project: projectId, session: id },
    );
  }

  async function detener(): Promise<void> {
    const id = target.session();
    const projectId = target.project();
    if (!id || !vivas().includes(id)) return;
    const scope = conversationScope(id, projectId);
    const hadPending = Boolean(handoff.view(scope).pending);
    const stopPromise = handoff.requestStop(scope);
    if (!hadPending) marcarQuieta(id, "interrupted");
    await stopPromise;
  }

  const questionTarget = () => ({
    project: target.project(),
    session: target.session(),
    msgs: target.msgs(),
  });

  const makeResponder = (responder: (turno: string, manda: RespuestaEnviada[], t?: { project: string; session: string; msgs: Msg[] }) => Promise<boolean>) =>
    (turno: string, manda: RespuestaEnviada[]) => responder(turno, manda, questionTarget());

  const makeCancel = (cancelar: (turno: string, t?: { project: string; session: string }) => Promise<void>) =>
    (turno: string) => cancelar(turno, { project: target.project(), session: target.session() });

  return {
    agent: inlineAgent,
    model: inlineModel,
    effort: inlineEffort,
    modo: inlineModo,
    borrador,
    input,
    archivos,
    setInput,
    setArchivos,
    agregarArchivos,
    navigateMentionHistory,
    onRecipient,
    onReference,
    onModel,
    onEffort,
    onModo,
    mandar,
    mandarTexto,
    detener,
    makeResponder,
    makeCancel,
  };
}
