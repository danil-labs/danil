import { callShellEngine } from "../../../session/src/shell-queries.ts";
import { imagenInerte } from "../../../ui/src/lib/chat/links";
import { capabilities } from "../../../host/src/platform";
import { onLogoInvalidate, scheduleLogoRetry, type LogoRead } from "./logo-src";

type ContextWorkspaceMeta = { logo: string | null; machines?: readonly string[] };

const images = new Map<string, Promise<LogoRead>>();
const listings = new Map<string, Promise<Map<string, ContextWorkspaceMeta> | null>>();
/** Último logo confirmado por `(context, workspace)`: se conserva al revalidar para evitar parpadeo. */
const resolved = new Map<string, string | null>();

const resolvedKey = (context: string, workspace: string) => JSON.stringify([context, workspace]);

onLogoInvalidate(() => {
  images.clear();
  listings.clear();
});

function machinePrefix(path: string, machines?: readonly string[]): string | null {
  const sep = path.indexOf("~");
  if (sep <= 0) return null;
  const candidate = path.slice(0, sep);
  if (machines?.includes(candidate)) return candidate;
  return capabilities().taskMachine?.(path) ?? null;
}

type ContextWorkspaceRow = { id: string; logo?: string | null; machines?: readonly string[] };

function listContextWorkspaces(context: string): Promise<Map<string, ContextWorkspaceMeta> | null> {
  let pending = listings.get(context);
  if (!pending) {
    pending = callShellEngine<{ workspaces?: ContextWorkspaceRow[] }>("list_workspaces", {}, { headers: { "x-danil-context": context } })
      .then((startup) => {
        const map = new Map<string, ContextWorkspaceMeta>();
        for (const row of startup.workspaces ?? []) {
          map.set(row.id, { logo: row.logo ?? null, machines: row.machines });
        }
        return map;
      })
      .catch(() => {
        listings.delete(context);
        return null;
      });
    listings.set(context, pending);
  }
  return pending;
}

export function cachedOrganizationLogo(context: string, workspace: string): string | null {
  return resolved.get(resolvedKey(context, workspace)) ?? null;
}

export function readOrganizationLogo(context: string, workspace: string, path: string | null): Promise<LogoRead> {
  const rk = resolvedKey(context, workspace);
  const key = JSON.stringify([context, workspace, path ?? ""]);
  let image = images.get(key);
  if (!image) {
    image = (async (): Promise<LogoRead> => {
      const accountAssets = capabilities().accountAssets;
      let accountConfirmedNone = false;
      if (accountAssets) {
        const fromAccount = await accountAssets.read(workspace, "logo", context).catch(() => undefined);
        if (typeof fromAccount === "string") {
          resolved.set(rk, fromAccount);
          return { ok: true, url: fromAccount };
        }
        if (fromAccount === null) accountConfirmedNone = true;
      }
      let resolvedPath = path;
      let machines: readonly string[] | undefined;
      if (!resolvedPath) {
        const map = await listContextWorkspaces(context);
        if (!map) {
          if (accountConfirmedNone && !capabilities().nativeWindow) {
            resolved.set(rk, null);
            return { ok: true, url: null };
          }
          images.delete(key);
          scheduleLogoRetry();
          return { ok: false };
        }
        const entry = map.get(workspace);
        if (!entry) {
          if (accountConfirmedNone) {
            resolved.set(rk, null);
            return { ok: true, url: null };
          }
          // El workspace aún no apareció en el listado del motor de este contexto.
          images.delete(key);
          return { ok: false };
        }
        resolvedPath = entry.logo;
        machines = entry.machines;
        if (!resolvedPath) {
          resolved.set(rk, null);
          return { ok: true, url: null };
        }
      }
      const machine = machinePrefix(resolvedPath, machines);
      const headers: Record<string, string> = { "x-danil-context": context, "x-terminus-workspace": workspace };
      if (machine) headers["x-terminus-machine"] = machine;
      try {
        const reply = await callShellEngine<{ data_url: string | null }>(
          "preview_file",
          { workspace, path: resolvedPath, rel: resolvedPath },
          { headers },
        );
        const url = imagenInerte(reply.data_url);
        resolved.set(rk, url);
        return { ok: true, url };
      } catch {
        images.delete(key);
        scheduleLogoRetry();
        return { ok: false };
      }
    })();
    images.set(key, image);
  }
  return image;
}

export function organizationLogo(context: string, workspace: string, path: string | null): Promise<string | null> {
  return readOrganizationLogo(context, workspace, path).then((r) => (r.ok ? r.url : null));
}
