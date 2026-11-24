import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { AgentProfile } from "../../../../ui/src/lib/model";
import { flechaDeLista } from "../../../../ui/src/lib/shortcuts";
import { corta } from "../../../../ui/src/lib/sites";
import { type BatchCloseAction, isTaskTab, type Tab, tabsToClose } from "../../../../ui/src/lib/tabs";
import { watchProfiles } from "../queries/profiles";
import { type GitStatus, watchSessionGit } from "../queries/taskGit";
import { EDGE, PEEK, scrollBySite, type TabStripProps } from "./tabs-model";

export function createTabStrip(props: TabStripProps) {
  let strip: HTMLDivElement | undefined;
  const [gitRows, setGitRows] = createSignal<Record<string, GitStatus>>({});
  const [profiles, setProfiles] = createSignal<Record<string, AgentProfile>>({});
  const projects = createMemo(() => JSON.stringify([...new Set(props.tabs.filter(isTaskTab).map(p => p.project))].sort()));
  createEffect(() => {
    const keys = projects();
    const watchers = (JSON.parse(keys) as string[]).map(project => {
      const watcher = watchSessionGit(project);
      createEffect(() => watcher.prioritize(props.tabs.filter(isTaskTab)
        .filter(p => p.project === project && p.id === props.activeId).map(p => p.session)));
      return watcher;
    });
    createEffect(() => setGitRows(Object.assign({}, ...watchers.map(w => w.rows()))));
    // Agentes del mismo nombre en distintos proyectos comparten la apariencia de la tira.
    const faces = (JSON.parse(keys) as string[]).map(watchProfiles);
    createEffect(() => setProfiles(Object.assign({}, ...faces.map((f) => f()))));
    onCleanup(() => watchers.forEach(w => w.release()));
  });

  // Calcular los grupos en cada pestaña las suscribiría individualmente a la tira entera.
  const separators = createMemo(() => {
    const out = new Set<string>();
    props.tabs.forEach((p, i) => {
      if (i === 0) return;
      const before = props.tabs[i - 1];
      if (p.session !== before.session || p.project !== before.project) out.add(p.id);
    });
    return out;
  });

  // Los nombres repetidos se distinguen con su carpeta dentro de esta tira.
  const labels = createMemo(() => {
    const path = (p: Tab) =>
      p.clase === "archivo" ? p.ruta : p.clase === "artefacto" ? p.rel : "";
    const name = (r: string) => r.slice(r.lastIndexOf("/") + 1);
    const count = new Map<string, number>();
    for (const p of props.tabs) {
      // Los sitios quedan fuera del recuento: no deben desambiguar nombres de archivo.
      if (isTaskTab(p) || p.clase === "sitio") continue;
      const n = name(path(p));
      count.set(n, (count.get(n) ?? 0) + 1);
    }
    return new Map(
      props.tabs
        .filter((p) => !isTaskTab(p))
        .map((p) => {
          if (p.clase === "sitio")
            return [p.id, p.url ? corta(p.url) : t("sites.new_tab")] as const;
          const r = path(p);
          const n = name(r);
          if ((count.get(n) ?? 0) < 2) return [p.id, n] as const;
          const remaining = r.slice(0, r.length - n.length - 1);
          const folder = remaining.slice(remaining.lastIndexOf("/") + 1);
          return [p.id, folder ? `${folder}/${n}` : n] as const;
        }),
    );
  });

  // Se revela el envoltorio, que incluye el botón de cerrar. Si hay que desplazar,
  // asoma también la vecina de ese lado para poder seguir avanzando con clics.
  function reveal(n: number) {
    revealElement(strip?.querySelector<HTMLElement>(`[data-envoltorio="${n}"]`), n > 0, n < props.tabs.length - 1);
  }
  function revealElement(element: HTMLElement | null | undefined, before: boolean, after: boolean) {
    if (!strip || !element) return;
    const start = element.offsetLeft - EDGE;
    const end = element.offsetLeft + element.offsetWidth + EDGE;
    const view = strip.clientWidth;
    let target = strip.scrollLeft;
    if (start < target) target = start - (before ? PEEK : 0);
    else if (end > target + view) target = end + (after ? PEEK : 0) - view;
    else return;
    strip.scrollLeft = Math.max(0, Math.min(target, strip.scrollWidth - view));
  }
  const site = () => strip?.closest("[data-ventana]")?.getAttribute("data-ventana") ?? "";
  let restored = false;
  createEffect(
    on(
      () => props.activeId,
      (id) => {
        if (!restored && strip) {
          restored = true;
          strip.scrollLeft = scrollBySite.get(site()) ?? 0;
        }
        if (!id) {
          if (props.draftLabel) revealElement(strip?.querySelector<HTMLElement>("[data-borrador]"), true, previewTabs().length > 0);
          return;
        }
        // Los ids contienen bytes nulos y no se pueden usar como valores de un selector CSS.
        const n = orderedTabs().findIndex((p) => p.id === id);
        if (n >= 0) reveal(n);
      },
    ),
  );

  function wheel(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement;
    const limit = el.scrollWidth - el.clientWidth;
    if (limit <= 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const before = el.scrollLeft;
    el.scrollLeft = Math.min(limit, Math.max(0, before + e.deltaY));
    if (el.scrollLeft !== before) e.preventDefault();
  }

  // Sin barra de desplazamiento: las pestañas se recorren con la rueda o el trackpad.
  function scrolled() {
    if (strip) scrollBySite.set(site(), strip.scrollLeft);
  }

  const [selected, setSelectedTab] = createSignal<string | null>(null);
  const group = (action: BatchCloseAction) => {
    const id = selected();
    return id ? tabsToClose(props.tabs, id, action) : [];
  };
  const closeBatch = (action: BatchCloseAction) => {
    const ids = group(action);
    if (ids.length) props.onCloseMany(ids);
  };

  function move(e: KeyboardEvent) {
    if (!flechaDeLista(e)) return;
    const offset = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!offset) return;
    e.preventDefault();
    const list = keptTabs();
    if (list.length === 0) return;
    const i = list.findIndex((p) => p.id === props.activeId);
    const next = list[(i + offset + list.length) % list.length];
    if (!next) return;
    props.onPick(next.id);
    const n = (i + offset + list.length) % list.length;
    strip?.querySelector<HTMLElement>(`[data-pestana="${n}"]`)?.focus();
    reveal(n);
  }

  const keptTabs = () => props.tabs.filter((p) => !props.pinnedIds || props.pinnedIds.has(p.id));
  const previewTabs = () => props.tabs.filter((p) => props.pinnedIds && !props.pinnedIds.has(p.id));
  const orderedTabs = () => [...keptTabs(), ...previewTabs()];
  return { strip: (el: HTMLDivElement) => { strip = el; }, gitRows, profiles, separators, labels, reveal, move, wheel, scrolled, orderedTabs, setSelectedTab, keptTabs, previewTabs, selected, closeBatch, group };
}
