/**
 * The logo and the chat background of the account's workspaces in the
 * browser: read from `logo_url` / `background_url` of `GET /v1/workspaces`
 * and changed with `PUT`/`DELETE /v1/workspaces/:id/logo|background`, with
 * the person's session. Images are shown as `data:` URIs: the page's CSP
 * loads no remote images.
 */
import { accountAssetUrl, readAccountAsset } from "@terminus/computers";
import { blobToDataUrl } from "../features/settings/account-profile.ts";
import { apiUrl } from "./computers.ts";
import { type Fetch, refused, sessionCall } from "./control-plane.ts";
import { platformFetch } from "../platform/client.ts";


export type WorkspaceAssetKind = "logo" | "background";

/** The background setting the account keeps beside the image (`settings.chat_background`). */
export type AccountChatBackground = { preset: string | null; veil: unknown };

export type WorkspaceAssetsSource = {
  /** The image as `data:`; `null` if the account has none; `undefined` if the account does not know (not linked, older control plane). */
  read(workspace: string, kind: WorkspaceAssetKind): Promise<string | null | undefined>;
  /** Preset and veils saved in the account, if any. */
  setting(workspace: string): Promise<AccountChatBackground | null>;
  /** `false` if the workspace is not in the account: the caller goes through the engine. */
  put(workspace: string, kind: WorkspaceAssetKind, image: Blob): Promise<boolean>;
  remove(workspace: string, kind: WorkspaceAssetKind): Promise<boolean>;
  /** Read the list again on the next call. */
  forget(): void;
};

type Row = Record<string, unknown> & { id: string };

export function webWorkspaceAssets(
  endpoint: string,
  getToken: () => string | Promise<string>,
  onUnauthorized?: () => void,
  f: Fetch = (input, init) => platformFetch(input, init),
): WorkspaceAssetsSource {
  let rows: Promise<Map<string, Row>> | null = null;
  const images = new Map<string, Promise<string | null>>();

  const call = sessionCall(getToken, onUnauthorized, f);

  function list(): Promise<Map<string, Row>> {
    rows ??= call(apiUrl(endpoint, "/v1/workspaces"))
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { workspaces?: unknown } | null;
        const map = new Map<string, Row>();
        if (!response.ok || !Array.isArray(body?.workspaces)) {
          rows = null;
          return map;
        }
        for (const w of body.workspaces as Row[]) if (w && typeof w.id === "string") map.set(w.id, w);
        return map;
      })
      .catch(() => {
        rows = null;
        return new Map<string, Row>();
      });
    return rows ?? Promise.resolve(new Map<string, Row>());
  }

  /** Only from the control plane's own origin: the session goes nowhere else (`readAccountAsset`). */
  function image(url: string, kind: WorkspaceAssetKind): Promise<string | null> {
    const target = accountAssetUrl(endpoint, url);
    if (!target) return Promise.resolve(null);
    let pending = images.get(target);
    if (!pending) {
      pending = Promise.resolve(getToken())
        .then((token) => readAccountAsset(endpoint, target, kind, token, f, onUnauthorized))
        .then((blob) => (blob ? blobToDataUrl(blob) : null))
        .catch(() => null);
      // A failed read is asked again next time.
      pending.then((v) => v === null && images.delete(target));
      images.set(target, pending);
    }
    return pending;
  }

  const code = async (response: Response) => ((await response.json().catch(() => null)) as { error?: { code?: unknown } } | null)?.error?.code;

  async function change(workspace: string, kind: WorkspaceAssetKind, init: RequestInit): Promise<boolean> {
    if (!(await list()).has(workspace)) return false;
    const url = apiUrl(endpoint, `/v1/workspaces/${encodeURIComponent(workspace)}/${kind}`);
    let response = await call(url, init);
    // Another change bumped the workspace's version at the same time: once more.
    if (response.status === 409 && (await code(response.clone())) === "settings_conflict") response = await call(url, init);
    const body = (await response.json().catch(() => null)) as (Row & { error?: { code?: unknown } }) | null;
    const failure = typeof body?.error?.code === "string" ? body.error.code : null;
    // Missing or someone else's: the workspace is not in this account.
    if (response.status === 404 && (failure === "not_found" || failure === "workspace_not_found")) return false;
    if (!response.ok) throw refused(failure ?? "unavailable");
    const map = await list();
    if (body && typeof body.id === "string") map.set(body.id, body);
    return true;
  }

  return {
    async read(workspace, kind) {
      const row = (await list()).get(workspace);
      const key = `${kind}_url`;
      if (!row || !(key in row)) return undefined;
      const url = row[key];
      return typeof url === "string" && url ? image(url, kind) : null;
    },
    async setting(workspace) {
      const raw = ((await list()).get(workspace)?.settings as Record<string, unknown> | null | undefined)?.chat_background;
      if (typeof raw !== "string") return null;
      try {
        const v = JSON.parse(raw) as { preset?: unknown; veil?: unknown } | null;
        if (!v || typeof v !== "object") return null;
        return { preset: typeof v.preset === "string" ? v.preset : null, veil: v.veil ?? null };
      } catch {
        return null;
      }
    },
    put: (workspace, kind, blob) => change(workspace, kind, { method: "PUT", headers: { "content-type": blob.type }, body: blob }),
    remove: (workspace, kind) => change(workspace, kind, { method: "DELETE" }),
    forget() {
      rows = null;
    },
  };
}
