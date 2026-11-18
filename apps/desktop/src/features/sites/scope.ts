import { unwrap } from "@terminus/fleet";
import type { PreviewScope } from "@terminus/computers";
import type { SiteProps } from "./types";

/** La máquina donde se crean tareas no identifica dónde corre una tarea existente. */
export function previewScope(context: SiteProps["context"], taskMachine?: (session: string) => string | null): PreviewScope | null {
  if (!context?.workspace || !context.session) return null;
  const machine = context.machine ?? taskMachine?.(context.session);
  if (!machine) return null;
  return { machine, workspace: context.workspace, session: unwrap(context.session, [machine])?.id ?? context.session };
}
