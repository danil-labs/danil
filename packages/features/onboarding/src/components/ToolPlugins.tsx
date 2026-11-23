import { listen } from "../../../../host/src/serviceEvents.ts";
import { AvanceDeDescarga, BarraDeCarga } from "./DownloadProgress";
import Check from "lucide-solid/icons/check";
import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { mb } from "../../../../../apps/desktop/src/lib/format";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { detalleDe, prosaDe } from "../../../../ui/src/Failure";
import { RemoveButton } from "../../../../ui/src/IconAction";
import { MarcaPlugin } from "../../../../ui/src/toolMarks";
import { Spinner } from "../../../../ui/src/Spinner";
import { ErrorDeTarjeta } from "./ConnectAI";
import { explicar } from "../queries/connect-store";
import {
  cancelInstall,
  getInstallSize,
  installIntegration,
  listIntegrations,
  setIntegrationEnabled,
  typstLiveStop,
  uninstallIntegration,
  type Plugin,
} from "../queries";
import { CON_PESO, ORDEN_PLUGINS, RECOMENDADOS, descripcion } from "../model/tool-cards";
import { VerMas } from "./ToolCardParts";

/** Los plugins se instalan dentro de su tarjeta; instalar sigue en segundo plano si se avanza. */
export function Plugins(props: { onCambio: (estado: { instalados: number; instalando: number }) => void }) {
  const [catalogo, setCatalogo] = createSignal<{ workspace: string; plugins: Plugin[] } | null>(null);
  const [falloDeCarga, setFalloDeCarga] = createSignal<string | null>(null);
  const [ocupados, setOcupados] = createStore<Record<string, "instalando" | "desinstalando" | "cancelado" | undefined>>({});
  const [errores, setErrores] = createStore<Record<string, string | null>>({});
  const [avances, setAvances] = createStore<Record<string, { hecho: number; total: number }>>({});
  const [pesos, setPesos] = createStore<Record<string, number | null>>({});
  const [verMas, setVerMas] = createSignal(false);
  let cerrada = false;

  const plugins = () =>
    [...(catalogo()?.plugins ?? [])]
      .filter((p) => ORDEN_PLUGINS.includes(p.id))
      .sort((a, b) => ORDEN_PLUGINS.indexOf(a.id) - ORDEN_PLUGINS.indexOf(b.id));
  const instalando = (p: Plugin) => ocupados[p.id] === "instalando" || (p.installing && !ocupados[p.id]);
  const peso = (p: Plugin) => {
    const b = pesos[p.id];
    if (b) return mb(b);
    return CON_PESO.has(p.id) ? t(`onboarding.tools.size.${p.id}`) : "";
  };

  function avisar() {
    props.onCambio({
      instalados: plugins().filter((p) => p.installed && !ocupados[p.id]).length,
      instalando: plugins().filter(instalando).length,
    });
  }

  async function cargar() {
    try {
      const c = await listIntegrations();
      if (cerrada) return;
      setCatalogo(c);
      avisar();
      for (const p of c.plugins.filter((x) => ORDEN_PLUGINS.includes(x.id) && pesos[x.id] === undefined)) {
        setPesos(p.id, null);
        getInstallSize(`plugin:${p.id}`)
          .then((b) => setPesos(p.id, b))
          .catch(() => {});
      }
    } catch (e) {
      setFalloDeCarga(explicar(e));
    }
  }
  onMount(() => void cargar());
  const cambios = listen("integrations-changed", () => void cargar());
  const avance = listen<{ operation: string; kind: string; done: number; bytes: number }>("install", (e) => {
    const id = e.payload.operation.startsWith("plugin:") ? e.payload.operation.slice(7) : null;
    if (!id || e.payload.bytes <= 0) return;
    setAvances(id, { hecho: e.payload.done, total: e.payload.bytes });
  });
  onCleanup(() => {
    cerrada = true;
    void cambios.then((f) => f());
    void avance.then((f) => f());
  });

  async function instalar(p: Plugin) {
    const workspace = catalogo()?.workspace;
    if (!workspace) return;
    setErrores(p.id, null);
    setAvances(p.id, { hecho: 0, total: pesos[p.id] ?? 0 });
    setOcupados(p.id, "instalando");
    avisar();
    try {
      await installIntegration(p.id);
      await setIntegrationEnabled(p.id, workspace, true);
    } catch (e) {
      if (!cerrada && ocupados[p.id] !== "cancelado" && !`${prosaDe(e)} ${detalleDe(e)}`.includes("install.cancelled")) setErrores(p.id, explicar(e));
    }
    if (cerrada) return;
    setOcupados(p.id, undefined);
    await cargar();
  }

  // La tarjeta vuelve al instante; el motor termina de cortar por detrás.
  function cancelar(p: Plugin) {
    setOcupados(p.id, "cancelado");
    avisar();
    void cancelInstall(`plugin:${p.id}`).catch(() => {});
  }

  async function desinstalar(p: Plugin) {
    setErrores(p.id, null);
    setOcupados(p.id, "desinstalando");
    avisar();
    try {
      // Un Tinymist vivo bloquea en Windows la carpeta que desinstalar borra.
      if (p.id === "typst") await typstLiveStop().catch(() => {});
      await uninstallIntegration(p.id);
    } catch (e) {
      setErrores(p.id, explicar(e));
    }
    setOcupados(p.id, undefined);
    await cargar();
  }

  function Tarjeta(q: { p: Plugin }) {
    const nombre = () => t(`onboarding.tools.plugin.${q.p.id}`);
    const sub = () => errores[q.p.id] ?? (!q.p.supported && !q.p.installed ? t("onboarding.tools.unsupported") : descripcion(q.p.id));
    const av = () => avances[q.p.id];
    return (
      <div
        class={cn(
          "relative flex h-16 items-center gap-3 overflow-hidden rounded-lg border px-3.5 py-2.5",
          instalando(q.p)
            ? "border-primary bg-primary/5"
            : q.p.installed && !ocupados[q.p.id]
              ? "border-success-strong/40 bg-success/5"
              : "border-border bg-surface-raised",
        )}
      >
        <span class="grid size-[26px] shrink-0 place-items-center rounded-md bg-surface-muted text-neutral-950">
          <MarcaPlugin id={q.p.id} size={15} />
        </span>
        <span class="grid min-w-0 flex-1 gap-1">
          <strong class="flex min-w-0 items-center text-ui leading-[1.2] font-semibold text-neutral-950">
            <span class="truncate">{nombre()}</span>
            <Show when={RECOMENDADOS.includes(q.p.id)}>
              <span class="ml-1 shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-2xs font-medium text-primary">
                {t("onboarding.tools.recommended")}
              </span>
            </Show>
          </strong>
          <span class={cn("truncate text-caption", errores[q.p.id] ? "text-error-strong" : "text-neutral-500")} title={sub()}>
            {sub()}
          </span>
        </span>
        <span class="flex w-[176px] shrink-0 items-center justify-end gap-1.5">
          <Switch
            fallback={
              <>
                <span class="text-caption whitespace-nowrap text-neutral-500">{peso(q.p)}</span>
                <Button
                  size="compact"
                  variant="secondary"
                  class="ml-1"
                  disabled={!q.p.supported}
                  onClick={() => void instalar(q.p)}
                >
                  {errores[q.p.id] ? t("onboarding.ai.retry") : t("onboarding.tools.install")}
                </Button>
              </>
            }
          >
            <Match when={instalando(q.p)}>
              <AvanceDeDescarga
                total={av()?.total ?? null}
                cancelar={t("onboarding.ai.cancel_download", { name: nombre() })}
                onCancelar={() => cancelar(q.p)}
              />
            </Match>
            <Match when={ocupados[q.p.id] === "desinstalando"}>
              <span class="text-caption whitespace-nowrap text-neutral-500">{t("onboarding.tools.uninstalling")}</span>
              <Spinner class="text-neutral-500" />
            </Match>
            <Match when={q.p.installed}>
              <span class="text-caption whitespace-nowrap text-neutral-500">{peso(q.p)}</span>
              <Badge tone="success" class="gap-1">
                <Check size={11} stroke-width={3} aria-hidden="true" />
                {t("onboarding.tools.installed")}
              </Badge>
              <RemoveButton
                icon="trash"
                label={t("onboarding.tools.uninstall", { name: nombre() })}
                onClick={() => void desinstalar(q.p)}
              />
            </Match>
          </Switch>
        </span>
        <Show when={instalando(q.p)}>
          <BarraDeCarga hecho={av()?.hecho ?? 0} total={av()?.total ?? null} />
        </Show>
      </div>
    );
  }

  const visibles = () => {
    const base = plugins().filter((p) => RECOMENDADOS.includes(p.id) || p.installed || instalando(p));
    const vistos = new Set(base.map((p) => p.id));
    return verMas() ? [...base, ...plugins().filter((p) => !vistos.has(p.id))] : base;
  };
  const escondidos = () => plugins().filter((p) => !visibles().includes(p));

  return (
    <>
      <div class="grid gap-2">
        <For each={visibles()}>{(p) => <Tarjeta p={p} />}</For>
      </div>
      <Show when={falloDeCarga()}>{(e) => <ErrorDeTarjeta class="rounded-md border-t" texto={e()} />}</Show>
      <VerMas
        abierto={verMas()}
        resto={escondidos().map((p) => ({ id: p.id, nombre: t(`onboarding.tools.plugin.${p.id}`), icono: <MarcaPlugin id={p.id} size={12} /> }))}
        onClick={() => setVerMas((v) => !v)}
      />
    </>
  );
}
