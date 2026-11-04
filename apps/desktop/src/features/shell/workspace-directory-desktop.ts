/**
 * El directorio de la cuenta desde la ventana: el mismo `GET /v1/me/workspaces`
 * de la web, con el token de cliente del motor. La persona elige con qué sesión
 * (`account`); sin ella, la del workspace abierto.
 */
import { type Answer, linkDanilWorkspace, listDirectory, setDirectoryPins } from "@terminus/computers";
import { invoke } from "../../lib/invoke.ts";
import type { Capabilities } from "../../lib/platform.ts";
import type { WorkspaceAccount } from "../settings/danil-sessions.ts";

type ClientToken = { token: string; expires_at: number; endpoint: string };

async function clientOf(account?: string | null): Promise<ClientToken> {
  let key = account ?? null;
  if (!key) {
    const of = await invoke<WorkspaceAccount>("danil_workspace_account", {}).catch(() => null);
    key = of?.signed_in ? of.account : null;
  }
  if (!key) throw Object.assign(new Error("no_account"), { detail: "no_account" });
  return invoke<ClientToken>("account_relay_token", { account: key });
}

function refused(answer: Answer<unknown>): never {
  const code =
    answer.kind === "error" && answer.status === 403
      ? "not_account_admin"
      : answer.kind === "error" && answer.code
        ? answer.code
        : answer.kind === "unauthorized"
          ? "unauthorized"
          : "directory_unavailable";
  throw Object.assign(new Error(code), { detail: code });
}

export function desktopWorkspaceDirectory(): NonNullable<Capabilities["workspaceDirectory"]> {
  return {
    list: async (account) => {
      const client = await clientOf(account);
      const answer = await listDirectory(client.endpoint, client.token);
      if (answer.kind !== "ok") refused(answer);
      return answer.value;
    },
    pin: async (keys, account) => {
      const client = await clientOf(account);
      const answer = await setDirectoryPins(client.endpoint, client.token, keys);
      if (answer.kind !== "ok") refused(answer);
    },
    link: async (workspaceId, danilWorkspaceId, account) => {
      const client = await clientOf(account);
      const answer = await linkDanilWorkspace(client.endpoint, client.token, workspaceId, danilWorkspaceId);
      if (answer.kind !== "ok") refused(answer);
    },
  };
}
