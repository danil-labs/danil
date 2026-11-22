import { invoke } from "../../../../engine-client/src/client.ts";

export const siteNavigate = (label: string, url: string) =>
  invoke("site_navigate", { label, url });

export const siteHide = (label: string) =>
  invoke("site_hide", { label });

export const siteGo = (label: string, delta: number) =>
  invoke("site_go", { label, delta });

export const siteReload = (label: string) =>
  invoke("site_reload", { label });

export const siteOpen = (params: { url: string; x: number; y: number; width: number; height: number }) =>
  invoke<{ label: string; url: string }>("site_open", params);

export const siteClose = (label: string) =>
  invoke("site_close", { label });

export const sitePlace = (params: { label: string; x: number; y: number; width: number; height: number }) =>
  invoke("site_place", params);

export const siteOpenExternal = (url: string) =>
  invoke("site_open_external", { url });
