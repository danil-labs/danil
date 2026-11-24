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
