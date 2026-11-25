import { displayWorkspaceContext } from "../../../../session/src/workspace-context.ts";
import { createContextViews } from "../../../../session/src/workspace-view-scope.ts";
import { createThreadsCore } from "./threads-store-core.ts";

const contexts = new WeakMap<object, string | null>();

export function createThreadsStore(deps: Parameters<typeof createThreadsCore>[0]) {
  return createContextViews(() => {
    const context = displayWorkspaceContext();
    const core = createThreadsCore({ ...deps, route: (id) => {
      const options = deps.route(id);
      return context ? { ...options, headers: { ...options?.headers, "x-danil-context": context } } : options;
    } });
    return { ...core,
      read: async (...args: Parameters<typeof core.read>) => {
        const result = await core.read(...args);
        contexts.set(result, context);
        return result;
      },
      acceptSession: (...args: Parameters<typeof core.acceptSession>) =>
        contexts.has(args[1]) && contexts.get(args[1]) !== context ? false : core.acceptSession(...args),
    };
  });
}
