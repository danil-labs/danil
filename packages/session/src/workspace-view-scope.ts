import { createSignal, getOwner, runWithOwner } from "solid-js";
import { displayWorkspaceContext } from "./workspace-context.ts";

const PREFIX = "context-view:";
/** La clave solo identifica vistas locales; nunca sustituye el id enviado al motor. */
export function workspaceViewKey(workspace: string, context = displayWorkspaceContext()): string {
  return !context || workspace.startsWith(PREFIX) ? workspace : `${PREFIX}${JSON.stringify([context, workspace])}`;
}

export const tabViewKey = (workspace: string, space: string | null) => space ? `pestanas.${workspaceViewKey(workspace)}.${space}` : `pestanas.${workspaceViewKey(workspace)}`;
export const panelViewKey = (workspace: string, space: string) => `panels.${workspaceViewKey(workspace)}.${space}`;

/** El core anterior queda ligado hasta que la transición guarda y activa la vista siguiente. */
export function createContextViews<T extends { activateWorkspace(workspace: string | null): unknown; dispose(): void }>(create: () => T): T {
  const owner = getOwner();
  const views = new Map<string, T>();
  const of = () => {
    const key = displayWorkspaceContext() ?? "";
    let view = views.get(key);
    if (!view) { view = owner ? runWithOwner(owner, create)! : create(); views.set(key, view); }
    return view;
  };
  const [current, setCurrent] = createSignal<T>(of());
  function call(key: PropertyKey, ...args: unknown[]) {
    if (key === "dispose") { for (const view of views.values()) view.dispose(); views.clear(); return; }
    if (key === "activateWorkspace") setCurrent(() => of());
    const view = current(), value = Reflect.get(view, key);
    return typeof value === "function" ? Reflect.apply(value, view, args) : value;
  }
  const methods = new Map<PropertyKey, (...args: unknown[]) => unknown>();
  return new Proxy({} as T, {
    get(_target, key) {
      let method = methods.get(key);
      if (!method) {
        method = call.bind(null, key);
        methods.set(key, method);
      }
      return method;
    },
  });
}
