import { callEngine, type InvokeOptions } from "../../../../engine-client/src/client.ts";
import type { ExportacionTypst } from "./typst";

export const treeTypstExport = (
  payload: unknown,
  options?: InvokeOptions,
): Promise<(ExportacionTypst)> =>
  callEngine<(ExportacionTypst)>("tree_typst_export", payload as Record<string, unknown>, options);

export const typstLiveChange = (
  payload: unknown,
  options?: InvokeOptions,
): Promise<void> =>
  callEngine("typst_live_change", payload as Record<string, unknown>, options);

export const typstLiveCloseDoc = (
  payload: unknown,
  options?: InvokeOptions,
): Promise<void> =>
  callEngine("typst_live_close_doc", payload as Record<string, unknown>, options);

export const typstLiveReveal = (
  payload: unknown,
  options?: InvokeOptions,
): Promise<void> =>
  callEngine("typst_live_reveal", payload as Record<string, unknown>, options);
