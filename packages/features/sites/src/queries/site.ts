import { callEngine } from "../../../../engine-client/src/client.ts";

export const siteNavigate = (label: string, url: string) =>
  callEngine("site_navigate", { label, url });

export const siteHide = (label: string) =>
  callEngine("site_hide", { label });

export const siteGo = (label: string, delta: number) =>
  callEngine("site_go", { label, delta });

export const siteReload = (label: string) =>
  callEngine("site_reload", { label });

export const siteOpen = (params: { url: string; x: number; y: number; width: number; height: number }) =>
  callEngine<{ label: string; url: string }>("site_open", params);

export const siteClose = (label: string) =>
  callEngine("site_close", { label });

export const sitePlace = (params: { label: string; x: number; y: number; width: number; height: number }) =>
  callEngine("site_place", params);

export const siteOpenExternal = (url: string) =>
  callEngine("site_open_external", { url });
