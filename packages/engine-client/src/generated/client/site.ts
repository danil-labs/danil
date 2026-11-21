// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { SiteCloseParams, SiteCloseOutput, SiteGoParams, SiteGoOutput, SiteHideParams, SiteHideOutput, SiteNavigateParams, SiteNavigateOutput, SiteOpenParams, SiteOpenOutput, SiteOpenExternalParams, SiteOpenExternalOutput, SiteOpenLocalParams, SiteOpenLocalOutput, SitePlaceParams, SitePlaceOutput, SiteReloadParams, SiteReloadOutput, SiteSweepParams, SiteSweepOutput, SiteZoomParams, SiteZoomOutput } from "../commands/site.ts";

export function bind_site(t: EngineTransport) {
  return {
    site_close: (params: SiteCloseParams) => t.call("site_close", params) as Promise<SiteCloseOutput>,
    site_go: (params: SiteGoParams) => t.call("site_go", params) as Promise<SiteGoOutput>,
    site_hide: (params: SiteHideParams) => t.call("site_hide", params) as Promise<SiteHideOutput>,
    site_navigate: (params: SiteNavigateParams) => t.call("site_navigate", params) as Promise<SiteNavigateOutput>,
    site_open: (params: SiteOpenParams) => t.call("site_open", params) as Promise<SiteOpenOutput>,
    site_open_external: (params: SiteOpenExternalParams) => t.call("site_open_external", params) as Promise<SiteOpenExternalOutput>,
    site_open_local: (params: SiteOpenLocalParams) => t.call("site_open_local", params) as Promise<SiteOpenLocalOutput>,
    site_place: (params: SitePlaceParams) => t.call("site_place", params) as Promise<SitePlaceOutput>,
    site_reload: (params: SiteReloadParams) => t.call("site_reload", params) as Promise<SiteReloadOutput>,
    site_sweep: () => t.call("site_sweep", {}) as Promise<SiteSweepOutput>,
    site_zoom: (params: SiteZoomParams) => t.call("site_zoom", params) as Promise<SiteZoomOutput>,
  };
}
