/**
 * Lo que se sabe de una tarea sin abrirla: la tarjeta flotante del sidebar del
 * escritorio (`TaskHoverCard`) y la vista previa del teléfono (mantener
 * pulsada la tarjeta). Título, lo último que se dijo, carpeta, agente,
 * proveedor y modelo, la máquina si hay más de una; y Abrir, Fijar o
 * Desfijar, y Archivar si no lo está.
 *
 * Cada cliente pinta esto a su manera; qué entra y con qué palabras sale de
 * aquí. Lo que solo el escritorio sabe (rama, PR, etapa) lo añade él.
 */
import { modelPresentation } from "./model-presentation.ts";
import { word } from "../../design/src/index.ts";
import { type CardOptions, type CardTask, taskCard } from "./card.ts";
import { isPinned } from "./view.ts";

type Lang = "es" | "en";

export type TitledTask = { title: string; inbox?: boolean; chat_de_agente?: boolean; agent_thread?: boolean; command_title?: boolean };

/**
 * El título de una fila, como la lista del escritorio: la bandeja vieja y el chat viejo del agente tienen el suyo.
 * Una tarea que solo corrió comandos no enseña el comando crudo; un motor viejo no manda `command_title`.
 */
export function taskTitle(lang: Lang, task: TitledTask): string {
  if (task.inbox) return word(lang, "projects.threads.inbox");
  if (task.chat_de_agente && !task.agent_thread) return word(lang, "projects.threads.persistent_chat");
  if (task.command_title) return word(lang, "projects.threads.command");
  return task.title;
}

/** Lo mínimo del catálogo de modelos de un proveedor (`list_models`) para nombrar uno. */
export type ModelCatalog = { models: readonly { id: string; label: string }[] } | null | undefined;

/**
 * Cómo se nombra un modelo: el id de Claude como en el selector
 * (`claude-opus-5-5` → «Claude Opus 5.5»); los demás con el rótulo del
 * catálogo, y sin catálogo, su id. Es `nombreDeModelo` del escritorio.
 */
export function modelName(id: string, catalog?: ModelCatalog): string {
  const clean = id.split("[")[0];
  const claude = /^claude-([a-z]+)((?:-\d{1,2})*)(?:-\d{8})?$/.exec(clean);
  if (claude) {
    const [, family, version] = claude;
    const name = `Claude ${family[0].toUpperCase()}${family.slice(1)}`;
    return version ? `${name} ${version.slice(1).replaceAll("-", ".")}` : name;
  }
  return modelPresentation(clean, catalog?.models.find((m) => m.id === clean)?.label).label;
}

export type PreviewTask = CardTask & TitledTask & {
  provider?: string | null;
  model?: string | null;
};

export type PreviewAction = "open" | "pin" | "unpin" | "archive";

export type TaskPreview = {
  title: string;
  /** Lo último que se dijo en la tarea, si hay algo. */
  excerpt: string | null;
  /** La carpeta (su id para el color); el nombre lo pone el cliente. */
  folder: string | null;
  agent: string | null;
  provider: string | null;
  /** El modelo con nombre legible; `null` es el modelo por omisión. */
  model: string | null;
  /** La máquina que la corre, solo si se enseña (más de una). */
  machine: { id: string; on: boolean } | null;
  pinned: boolean;
  /** En el orden de los botones del escritorio. */
  actions: PreviewAction[];
};

export function taskPreview<T extends PreviewTask>(
  lang: Lang,
  task: T,
  options: CardOptions<T> & { catalog?: ModelCatalog },
): TaskPreview {
  const card = taskCard(task, options);
  const pinned = isPinned(task);
  const excerpt = task.last_message?.trim() || null;
  return {
    title: taskTitle(lang, task),
    excerpt,
    folder: card.folder,
    agent: task.agent ?? null,
    provider: task.provider || null,
    model: task.model ? modelName(task.model, options.catalog) : null,
    machine: card.machine,
    pinned,
    actions: ["open", pinned ? "unpin" : "pin", ...(task.archived ? [] : (["archive"] as const))],
  };
}

/** Las palabras de cada botón y fila, con las claves del escritorio. */
export function previewLabel(lang: Lang, what: PreviewAction | "folder" | "agent" | "provider" | "default_model"): string {
  switch (what) {
    case "open": return word(lang, "projects.hover_card.open");
    case "pin": return word(lang, "projects.sessions.pin");
    case "unpin": return word(lang, "projects.sessions.unpin");
    case "archive": return word(lang, "projects.hover_card.archive");
    case "folder": return word(lang, "projects.hover_card.folder");
    case "agent": return word(lang, "projects.hover_card.agent");
    case "provider": return word(lang, "projects.hover_card.provider");
    default: return word(lang, "projects.hover_card.default_model");
  }
}
