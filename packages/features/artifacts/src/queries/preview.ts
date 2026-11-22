import type { InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";
import type { VersionRef } from "./history.ts";

export type Preview = {
  rel: string;
  kind: "html" | "image" | "text" | "pdf" | "binary" | string;
  text: string | null;
  data_url: string | null;
  pdf: string | null;
  bytes: number;
  truncated: boolean;
};

type previewResult = Preview;

export const previewFile = (path: string, rel: string, en?: InvokeOptions) =>
  invoke<previewResult>("preview_file", { path, rel }, en);

export const preparePrint = (path: string, html: string) =>
  invoke<string>("prepare_print", { path, html });

export const openExternal = (target: string) =>
  invoke("open_external", { target });

export const readArtifactPart = (
  referencia: VersionRef,
  offset: number,
  size: number,
  en?: InvokeOptions,
) =>
  invoke<{ data: string; eof: boolean }>("artifact_read_part", { referencia, offset, size }, en);
