import { createMemo, createSignal, untrack } from "solid-js";
import type { Project, Source } from "../../../../../apps/desktop/src/lib/model";
import type { Trigger } from "../../../../../apps/desktop/src/lib/mentions";
import { editDraft, insertMention, insertRecipient } from "../../../../../apps/desktop/src/lib/recipients.ts";
import type { MentionTarget, TaskMention, TextEdit } from "../../../../../apps/desktop/src/lib/taskMentions";
import { adjuntosDevueltos, adjuntosSinMandar, fuentesHeredadas, sameSources, unirFuentes } from "../../../../../apps/desktop/src/lib/taskDraft.ts";

import type { Draft, DraftConfiguration, HandoverPending, HistoryEntry } from "../../../../ui/src/lib/draft.ts"; export type { Draft, DraftConfiguration, HandoverPending, HistoryEntry };

type Dependencies = {
  key: () => string;
  workspace: () => string | null;
  generation: () => number;
  project: () => string;
  projects: () => Project[];
  sources: () => Source[] | null | undefined;
  prepareAttachments: (paths: string[], project: string) => Promise<string[]>;
};
const EMPTY: Draft = { input: "", sourceIds: [], excludedSourceIds: [], archivos: [] };
const entry = (draft: Draft): HistoryEntry => ({ text: draft.input, task_mentions: draft.task_mentions, recipients: draft.recipients });

/** Draft text, references and material survive view switches, but never workspace switches. */
export function createDraftsStore(deps: Dependencies) {
  const [drafts, setDrafts] = createSignal<Record<string, Draft>>({});
  const [attached, setAttached] = createSignal<string[]>([]);
  let epoch = 0;
  let disposed = false;
  const peek = (key: string) => drafts()[key];
  const current = () => peek(deps.key()) ?? EMPTY;
  const edit = (key: string, update: (draft: Draft) => Draft) =>
    setDrafts(all => ({ ...all, [key]: update(all[key] ?? EMPTY) }));
  const sourceIds = createMemo(() => current().sourceIds, undefined, { equals: sameSources });
  const excludedSourceIds = createMemo(() => current().excludedSourceIds, undefined, { equals: sameSources });
  const projectSources = createMemo(() => deps.projects().find(project => project.id === deps.project())?.sources ?? []);
  const inherited = createMemo(() => fuentesHeredadas(deps.projects(), deps.project(), excludedSourceIds()));
  const sourcesOf = (ids: string[]) => ids.map(id => deps.sources()?.find(source => source.id === id)).filter((source): source is Source => !!source);
  const pendingMaterial = createMemo(() => sourcesOf(sourceIds()));
  const context = createMemo(() => sourcesOf(unirFuentes(inherited(), attached())));

  function changeText(value: string, inputType?: string, change?: TextEdit) {
    edit(deps.key(), draft => {
      const history = [...(draft.mentionHistory ?? []), entry(draft)].slice(-100);
      const restored = inputType?.startsWith("history") ? [...history].reverse().find(item => item.text === value) : undefined;
      const next = editDraft(entry(draft), value, change);
      return { ...draft, input: value, task_mentions: restored?.task_mentions ?? next.task_mentions,
        recipients: restored?.recipients ?? next.recipients, mentionHistory: history, mentionFuture: [] };
    });
  }
  function history(redo: boolean) {
    const draft = current();
    const past = draft.mentionHistory ?? [];
    const future = draft.mentionFuture ?? [];
    if (![...past, ...future, draft].some(item => item.task_mentions?.length || item.recipients?.length)) return false;
    const next = (redo ? future : past).at(-1);
    if (!next) return false;
    edit(deps.key(), before => ({ ...before, input: next.text, task_mentions: next.task_mentions, recipients: next.recipients,
      mentionHistory: redo ? [...past, entry(draft)] : past.slice(0, -1),
      mentionFuture: redo ? future.slice(0, -1) : [...future, entry(draft)],
    }));
    return true;
  }
  function insert(next: (before: HistoryEntry) => HistoryEntry) {
    edit(deps.key(), draft => {
      const after = next(entry(draft));
      return { ...draft, input: after.text, task_mentions: after.task_mentions, recipients: after.recipients,
        mentionHistory: [...(draft.mentionHistory ?? []), entry(draft)].slice(-100), mentionFuture: [] };
    });
  }
  async function addFiles(paths: string[]) {
    if (disposed) return;
    const key = deps.key(), workspace = deps.workspace(), generation = deps.generation(), requestEpoch = epoch;
    const prepared = await deps.prepareAttachments(paths, deps.project());
    if (disposed || workspace !== deps.workspace() || generation !== deps.generation() || requestEpoch !== epoch) return;
    edit(key, draft => ({ ...draft, archivos: [...new Set([...draft.archivos, ...prepared])] }));
  }
  function addSource(id: string) {
    const projectIds = untrack(projectSources), attachedIds = untrack(attached);
    edit(deps.key(), draft => ({ ...draft,
      sourceIds: projectIds.includes(id) || draft.sourceIds.includes(id) || attachedIds.includes(id) ? draft.sourceIds : [...draft.sourceIds, id],
      excludedSourceIds: draft.excludedSourceIds.filter(source => source !== id),
    }));
  }
  function removeSource(id: string) {
    const projectIds = untrack(projectSources);
    edit(deps.key(), draft => ({ ...draft, sourceIds: draft.sourceIds.filter(source => source !== id),
      excludedSourceIds: projectIds.includes(id) && !draft.excludedSourceIds.includes(id) ? [...draft.excludedSourceIds, id] : draft.excludedSourceIds,
    }));
    setAttached(ids => ids.filter(source => source !== id));
  }
  return {
    peek, current, sourceIds, excludedSourceIds, attached, pendingMaterial, context,
    input: () => current().input,
    files: () => current().archivos,
    changeText, history, addFiles, addSource, removeSource,
    recipient: (name: string, label: string, trigger: Trigger) => insert(before => insertRecipient(before, trigger, name, label)),
    reference: (target: MentionTarget, label: string, trigger: Trigger) => insert(before => insertMention(before, trigger, target, label)),
    replaceFiles: (files: string[]) => edit(deps.key(), draft => ({ ...draft, archivos: files })),
    replaceAttached: (ids: string[]) => setAttached(ids),
    acceptSources: (ids: string[]) => setAttached(before => unirFuentes(before, ids)),
    configure: (configuration: DraftConfiguration, key = deps.key()) => edit(key, draft => ({ ...draft,
      configuration: { ...configuration, mode: configuration.mode ?? draft.configuration?.mode },
    })),
    handover: (provider: HandoverPending | null | undefined, key = deps.key()) => edit(key, draft => ({ ...draft, provider: provider ?? undefined })),
    invalidateProvider: (key: string, provider: string) => setDrafts(all => {
      const draft = all[key];
      if (!draft?.provider || draft.provider.from === provider) return all;
      const { provider: _, ...rest } = draft;
      return { ...all, [key]: rest };
    }),
    restoreSession: (key: string, excluded: string[]) => edit(key, draft => ({ ...draft, excludedSourceIds: excluded })),
    retryText: (text: string, mentions?: TaskMention[]) => edit(deps.key(), draft => ({ ...draft, input: text, task_mentions: mentions })),
    takeFiles: (key: string, files: string[]) => edit(key, draft => ({ ...draft, archivos: adjuntosSinMandar(draft.archivos, files) })),
    restoreFailed: (key: string, message: HistoryEntry, files: string[]) => edit(key, draft => ({
      ...(draft.input ? draft : { ...draft, input: message.text, task_mentions: message.task_mentions, recipients: message.recipients }),
      archivos: adjuntosDevueltos(draft.archivos, files),
    })),
    sentSources: (key: string, ids: string[]) => edit(key, draft => ({ ...draft, sourceIds: draft.sourceIds.filter(id => !ids.includes(id)) })),
    continueFrom: (prompt: string, path: string, sources: string[], excluded: string[]) => edit(deps.key(), draft => ({ ...draft,
      input: [prompt, draft.input].filter(Boolean).join("\n\n"), archivos: [...draft.archivos, path],
      sourceIds: unirFuentes(draft.sourceIds, sources), excludedSourceIds: unirFuentes(draft.excludedSourceIds, excluded),
    })),
    promote: (from: string, to: string) => setDrafts(all => {
      const { [from]: draft, ...rest } = all;
      return draft ? { ...rest, [to]: draft } : rest;
    }),
    drop: (key: string) => setDrafts(all => {
      if (!(key in all)) return all;
      const { [key]: _, ...rest } = all;
      return rest;
    }),
    reset: () => { epoch++; setDrafts({}); setAttached([]); },
    dispose: () => { disposed = true; epoch++; },
  };
}
