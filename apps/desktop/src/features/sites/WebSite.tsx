import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js";
import { localPreviewTarget } from "@terminus/computers";
import { capabilities } from "../../lib/platform";
import { aDireccion, corta } from "../../lib/sites";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { previewSession, type PreviewState } from "./preview-session";
import type { SiteProps } from "./types";
import { previewScope } from "./scope";

export default function WebSite(props: SiteProps) {
  const [state, setState] = createSignal<PreviewState>({ kind: "closed" });
  const [address, setAddress] = createSignal("");
  const access = capabilities().machinePreview;
  const session = access ? previewSession({ client: access, changed: setState }) : undefined;
  const frameUrl = createMemo(() => {
    const view = state();
    return view.kind === "loading" || view.kind === "live" ? view.url : undefined;
  });
  const errorKey = () => {
    const view = state();
    if (view.kind === "unavailable") return "sites.preview.unavailable";
    if (!("code" in view)) return "sites.preview.failed";
    if (view.code === "lease_expired") return "sites.preview.expired";
    if (view.code === "port_not_owned" || view.code === "port_reserved" || view.code === "forbidden") return "sites.preview.forbidden";
    if (view.code === "port_not_listening" || view.code === "machine_offline") return "sites.preview.offline";
    if (view.code === "unsupported_url") return "sites.preview.local_only";
    if (view.code === "tls_unsupported") return "sites.preview.http_only";
    if (view.code === "scope_missing") return "sites.preview.task_required";
    return "sites.preview.failed";
  };
  function open(url: string) {
    session?.close();
    if (!url) return setState({ kind: "closed" });
    const target = localPreviewTarget(url);
    if (!target) return setState({ kind: "failed", code: "unsupported_url" });
    if (new URL(url).protocol === "https:") return setState({ kind: "failed", code: "tls_unsupported" });
    if (!session || !access) return setState({ kind: "unavailable" });
    const scope = previewScope(props.context, capabilities().taskMachine);
    if (!scope) return setState({ kind: "failed", code: "scope_missing" });
    void session.open(scope, target.port, target.path);
  }
  createEffect(on(() => [props.url, props.context?.workspace, props.context?.session, props.context?.machine], () => { setAddress(props.url); open(props.url); }));
  onCleanup(() => session?.close());
  const hide = () => session?.close();
  window.addEventListener("pagehide", hide);
  onCleanup(() => window.removeEventListener("pagehide", hide));
  const resume = (event: PageTransitionEvent) => { if (event.persisted) open(props.url); };
  window.addEventListener("pageshow", resume);
  onCleanup(() => window.removeEventListener("pageshow", resume));
  return (
    <div class="relative flex h-full flex-col" data-web-site="" data-preview-state={state().kind}>
      <div class="flex items-center gap-1 border-b border-border bg-surface px-2 py-1">
        <Button variant="ghost" size="sm" disabled aria-label={t("sites.back")} title={t("sites.back")}>←</Button>
        <Button variant="ghost" size="sm" disabled aria-label={t("sites.forward")} title={t("sites.forward")}>→</Button>
        <Button variant="ghost" size="sm" aria-label={t("sites.reload")} title={t("sites.reload")} onClick={() => open(props.url)}>⟳</Button>
        <Show when={props.navegador} fallback={<span class="ml-1 min-w-0 flex-1 truncate font-mono text-caption text-neutral-500">{props.url}</span>}>
          <input type="text" spellcheck={false} autocomplete="off" aria-label={t("sites.address")} placeholder={t("sites.address_placeholder")}
            value={address()} onInput={event => setAddress(event.currentTarget.value)}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); const url = aDireccion(address()); if (url) props.onNavego?.(url); } }}
            class="ml-1 h-6 min-w-0 flex-1 rounded-sm border border-border bg-surface-muted px-2 font-mono text-caption text-neutral-950 outline-none placeholder:text-neutral-500 focus:border-primary" />
        </Show>
        <Button variant="ghost" size="sm" disabled={!frameUrl()} aria-label={t("sites.outside")} title={t("sites.outside")}
          onClick={() => { const url = frameUrl(); if (url) window.open(url, "_blank", "noopener,noreferrer"); }}>↗</Button>
      </div>
      <div class="relative min-h-0 flex-1 bg-surface">
        <Show when={frameUrl()}>
          <iframe src={frameUrl()} title={t("sites.preview.title", { site: corta(props.url) })}
            sandbox="allow-scripts allow-same-origin allow-forms" referrerpolicy="no-referrer"
            class="h-full w-full border-0" onLoad={() => session?.loaded()} onError={() => session?.failed()} />
        </Show>
        <Show when={state().kind === "opening"}>
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center" role="status">
            <span class="text-ui text-neutral-500">{t("sites.opening", { site: corta(props.url) })}</span>
          </div>
        </Show>
        <Show when={state().kind === "loading" && (state() as { slow?: boolean }).slow}>
          <div class="absolute bottom-3 left-3 rounded-sm border border-border bg-surface px-3 py-2 text-caption text-neutral-700" role="status">{t("sites.preview.slow")}</div>
        </Show>
        <Show when={state().kind === "closed"}>
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center"><span class="text-ui text-neutral-500">{t("sites.start")}</span></div>
        </Show>
        <Show when={state().kind === "failed" || state().kind === "unavailable"}>
          <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center" role="alert">
            <span class="max-w-[46ch] text-ui text-neutral-700">{t(errorKey())}</span>
            <Button variant="secondary" size="sm" onClick={() => open(props.url)}>{t("sites.retry")}</Button>
          </div>
        </Show>
      </div>
    </div>
  );
}
