import { callEngine, type InvokeOptions } from "../../../../engine-client/src/client.ts";
import type { VersionRef } from "./history.ts";

import type { Preview } from "../../../../ui/src/lib/preview.ts";
export type { Preview };

type previewResult = Preview;

export const previewFile = (path: string, rel: string, en?: InvokeOptions) =>
  callEngine<previewResult>("preview_file", { path, rel }, en);

export const preparePrint = (path: string, html: string) =>
  callEngine<string>("prepare_print", { path, html });

export const openExternal = (target: string) =>
  callEngine("open_external", { target });

export const readArtifactPart = (
  referencia: VersionRef,
  offset: number,
  size: number,
  en?: InvokeOptions,
) =>
  callEngine<{ data: string; eof: boolean }>("artifact_read_part", { referencia, offset, size }, en);
