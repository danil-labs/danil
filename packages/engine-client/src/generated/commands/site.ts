// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface SiteCloseParams {
  label: string;
}
export type SiteCloseOutput = null;

export interface SiteGoParams {
  label: string;
  delta: number;
}
export type SiteGoOutput = null;

export interface SiteHideParams {
  label: string;
}
export type SiteHideOutput = null;

export interface SiteNavigateParams {
  label: string;
  url: string;
}
export type SiteNavigateOutput = null;

export interface SiteOpenParams {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export type SiteOpenOutput = unknown;

export interface SiteOpenExternalParams {
  url: string;
}
export type SiteOpenExternalOutput = null;

export interface SiteOpenLocalParams {
  port: number;
  css?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}
export type SiteOpenLocalOutput = unknown;

export interface SitePlaceParams {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export type SitePlaceOutput = null;

export interface SiteReloadParams {
  label: string;
}
export type SiteReloadOutput = null;

export type SiteSweepParams = Record<string, never>;
export type SiteSweepOutput = null;

export interface SiteZoomParams {
  label: string;
  factor: number;
}
export type SiteZoomOutput = null;

export const COMMANDS_SITE = {
  site_close: { kind: "desktop", scope: null, authority: "admin", channel: null },
  site_go: { kind: "desktop", scope: null, authority: "admin", channel: null },
  site_hide: { kind: "desktop", scope: null, authority: "admin", channel: null },
  site_navigate: { kind: "desktop", scope: null, authority: "admin", channel: null },
  site_open: { kind: "desktop", scope: null, authority: "admin", channel: null },
  site_open_external: { kind: "desktop", scope: null, authority: "admin", channel: null },
  site_open_local: { kind: "desktop", scope: null, authority: "admin", channel: null },
  site_place: { kind: "desktop", scope: null, authority: "admin", channel: null },
  site_reload: { kind: "desktop", scope: null, authority: "admin", channel: null },
  site_sweep: { kind: "desktop", scope: null, authority: "admin", channel: null },
  site_zoom: { kind: "desktop", scope: null, authority: "admin", channel: null },
} as const;
