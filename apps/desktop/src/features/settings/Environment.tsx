import { getVersion } from "@tauri-apps/api/app";
import BrowserNavigation from "./BrowserNavigation";
import Actualizacion from "./Update";
import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { listen } from "../../lib/serviceEvents";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import SquareArrowOutUpRight from "lucide-solid/icons/square-arrow-out-up-right";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronUp from "lucide-solid/icons/chevron-up";
import {
  ORIGEN_APP,
  ORIGEN_BUNDLE,
  ORIGEN_SISTEMA,
  type Dependency,
  type EnvReport,
  type Requirement,
} from "./environment-store";
import { MarcaAgente } from "../../ui/icons";
import { FailureNote, asFailure, type Failure } from "../../ui/Failure";
import { esIncluida, fallasIncluidas } from "../onboarding/bundled";
import { FuncionesAfectadas } from "../onboarding/Repair";
import { peso } from "../../lib/format";
import { Skeleton } from "../../ui/Skeleton";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "../../ui/Tooltip";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/Button";
import { SettingsBlock, SettingsPanel, SettingsSection } from "./layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../ui/Table";
import "../../locales/settingsPhrases";

type Columna = "label" | "version" | "location" | "bytes" | "source";

function tituloDe(id: Columna): string {
  switch (id) {
    case "label":
      return t("settings.environment.column.name");
    case "version":
      return t("settings.environment.column.version");
    case "location":
      return t("settings.environment.column.location");
    case "bytes":
      return t("settings.environment.column.size");
    case "source":
      return t("settings.environment.column.source");
  }
}

const COLUMNAS: { id: Columna; alinear?: "right"; ancho: string }[] = [
  { id: "label", ancho: "w-[24%]" },
  { id: "version", ancho: "w-[14%]" },
  { id: "location", ancho: "w-[30%]" },
  { id: "bytes", alinear: "right", ancho: "w-[10%]" },
  { id: "source", ancho: "w-[22%]" },
];

/** Lenguajes y gestores de paquetes: son de quien usa la computadora y aquí no se listan. */
const AJENAS = new Set(["node", "npm", "pnpm", "bun", "cargo", "rust", "rustc"]);
// La navegación tiene su propia sección.
const esExtra = (id: string) => !esIncluida(id) && !AJENAS.has(id) && id !== "browser-navigation";
type Fila = Requirement & { dependency?: Dependency };

export default function Environment() {
  const [appVersion, setAppVersion] = createSignal<string | null>(null);
  const [filas, setFilas] = createSignal<Dependency[]>([]);
  const [reporte, setReporte] = createSignal<EnvReport | null>(null);
  const [cargando, setCargando] = createSignal(true);
  const [fallo, setFallo] = createSignal<Failure | null>(null);
  const [reparando, setReparando] = createSignal(false);
  const [falloDeReparar, setFalloDeReparar] = createSignal<Failure | null>(null);
  const [orden, setOrden] = createSignal<{ columna: Columna; direccion: "asc" | "desc" }>({
    columna: "bytes",
    direccion: "desc",
  });

  async function cargar(force = false) {
    setCargando(true);
    setFallo(null);
    try {
      const [deps, env] = await Promise.all([
        invoke<Dependency[]>("list_dependencies", { force }),
        invoke<EnvReport>("check_environment", { force }),
      ]);
      setFilas(deps);
      setReporte(env);
    } catch (e) {
      setFallo({ ...asFailure(e), what: t("settings.environment.error_check") });
    } finally {
      setCargando(false);
    }
  }

  onMount(() => {
    void getVersion().then(setAppVersion).catch(() => {});
    void cargar();

    const cambios = listen("providers", () => void cargar(true));
    onCleanup(() => void cambios.then((f) => f()));
    const toolchain = listen("toolchain", () => void cargar(true));
    onCleanup(() => void toolchain.then((f) => f()));
    const bootstrap = listen("bootstrap", () => void cargar(true));
    onCleanup(() => void bootstrap.then((f) => f()));
  });

  function alternar(columna: Columna) {
    setOrden((o) =>
      o.columna === columna
        ? { columna, direccion: o.direccion === "asc" ? "desc" : "asc" }
        : { columna, direccion: columna === "bytes" ? "desc" : "asc" },
    );
  }

  const ordenadas = createMemo(() => {
    const { columna, direccion } = orden();
    const signo = direccion === "asc" ? 1 : -1;
    const dependencies = new Map(filas().map((fila) => [fila.id, fila]));
    const rows: Fila[] = (reporte()?.items ?? []).filter((fila) => esExtra(fila.id)).map((fila) => ({
      ...fila,
      dependency: dependencies.get(fila.id),
    }));
    return rows.sort((a, b) => {
      if (columna === "bytes") {
        return signo * ((a.dependency?.bytes ?? a.bytes ?? -1) - (b.dependency?.bytes ?? b.bytes ?? -1));
      }
      const value = (row: Fila) => {
        switch (columna) {
          case "label": return row.label;
          case "version": return row.dependency?.version ?? "";
          case "location": return row.dependency?.location ?? "";
          case "source": return row.source ?? "";
        }
      };
      return signo * value(a).localeCompare(value(b));
    });
  });

  async function revelar(d: Dependency) {
    await invoke("open_external", { target: d.location }).catch(() => {});
  }

  function origin(source: string | null) {
    if (source === ORIGEN_SISTEMA) return t("settings.environment.origin.system");
    if (source === ORIGEN_APP) return t("settings.environment.origin.app");
    if (source === ORIGEN_BUNDLE) return t("settings.environment.origin.bundle");
    return t("settings.environment.origin.missing");
  }

  const status = (fila: Fila) => {
    if (fila.timed_out) return t("settings.environment.status.timed_out");
    if (!fila.ok) return t("settings.environment.status.missing");
    return t("settings.environment.status.ready");
  };
  const fallas = () => fallasIncluidas(reporte());

  /** Lo incluido se repara entero: el motor lo verifica todo y vuelve a comprobar. */
  async function reparar() {
    setReparando(true);
    setFalloDeReparar(null);
    try {
      await invoke("install_tool", { tool: "bundled-work-tools" });
    } catch (e) {
      setFalloDeReparar({ ...asFailure(e), what: t("setup.functions.repair_failed") });
    } finally {
      setReparando(false);
    }
    await cargar(true);
  }

  return (
    <SettingsPanel>
      <Show when={appVersion()}>
        {(version) => <SettingsSection title={t("settings.environment.release")}>
          <p class="m-0 font-mono text-body text-neutral-950" data-app-release="">{version()}</p>
          <Show when={version().split("-")[1]?.split(".")[0]}>
            {(channel) => <p class="m-0 text-body text-neutral-500">{t("settings.environment.release_channel", { channel: channel() })}</p>}
          </Show>
        </SettingsSection>}
      </Show>
      <Show
        when={capabilities().updater}
        fallback={<SettingsSection title={t("settings.update.title")} description={t("settings.update.web")} />}
      >
        <Actualizacion build={reporte()?.build} />
      </Show>
      <Show when={reporte()?.engineBuild}>
        {(build) => <p class="text-sm text-neutral-500">{t("settings.environment.engine_build", { build: build() })}</p>}
      </Show>

      <BrowserNavigation requirement={reporte()?.items.find((r) => r.id === "browser-navigation")} onPrepared={() => cargar(true)} />

      <SettingsSection
        title={t("settings.environment.title")}
        description={t("settings.environment.intro")}
        aside={
          <Button
            variant="ghost"
            size="compact"
            disabled={cargando()}
            aria-label={t("settings.environment.recheck")}
            title={t("settings.environment.recheck")}
            onClick={() => void cargar(true)}
          >
            <RefreshCw size={13} class={cn(cargando() && "animate-spin")} />
            {t("settings.environment.recheck")}
          </Button>
        }
      >
        <Show when={cargando() && filas().length === 0}>
          <SettingsBlock>
            <Skeleton filas={4} />
          </SettingsBlock>
        </Show>

        <Show when={fallo()}>
          {(f) => (
            <SettingsBlock>
              <FailureNote f={f()} />
            </SettingsBlock>
          )}
        </Show>

        <Show when={reporte()?.reason}>
          {(razon) => (
            <SettingsBlock>
              <p class="m-0 border-l-2 border-warning px-2.5 py-1.5 text-ui text-neutral-500">
                {razon()}
              </p>
            </SettingsBlock>
          )}
        </Show>

        <Show when={reporte()}>
          <SettingsBlock>
            <div class="grid gap-2.5" data-environment-bundled="">
              <p class="m-0 text-sm text-neutral-950">
                {fallas().length ? t("settings.environment.bundled.attention") : t("settings.environment.bundled.ready")}
              </p>
              <Show when={fallas().length > 0}>
                <FuncionesAfectadas
                  fallas={fallas()}
                  reparando={reparando()}
                  error={falloDeReparar()}
                  onReparar={() => void reparar()}
                  onReiniciar={() => void invoke("restart_app")}
                />
              </Show>
            </div>
          </SettingsBlock>
        </Show>

        <Show when={ordenadas().length > 0}>
          <SettingsBlock>
            <div
              class={cn(
                "overflow-x-auto rounded-lg border border-border transition-opacity",
                cargando() && "pointer-events-none opacity-60",
              )}
            >
              <Table class="table-fixed">
                <TableHead>
                  <TableRow>
                    <For each={COLUMNAS}>
                      {(c) => (
                        <TableHeaderCell
                          class={cn(
                            c.ancho,
                            "cursor-pointer text-xs tracking-normal normal-case select-none",
                            c.alinear === "right" && "text-right",
                          )}
                          aria-sort={
                            orden().columna === c.id
                              ? orden().direccion === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                          onClick={() => alternar(c.id)}
                        >
                          <span
                            class={cn(
                              "inline-flex items-center gap-0.5",
                              c.alinear === "right" && "flex-row-reverse",
                            )}
                          >
                            {tituloDe(c.id)}
                            <Show when={orden().columna === c.id}>
                              {orden().direccion === "asc" ? (
                                <ChevronUp size={12} />
                              ) : (
                                <ChevronDown size={12} />
                              )}
                            </Show>
                          </span>
                        </TableHeaderCell>
                      )}
                    </For>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <For each={ordenadas()}>
                    {(d) => (
                      <TableRow class="group">
                        <TableCell class="truncate text-sm">
                          <span class="flex min-w-0 items-center gap-1.5">
                            <MarcaAgente id={d.id} size={14} />
                            <span class="truncate">{d.label}</span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="top">
                            <TooltipTrigger
                              as="span"
                              class="block min-w-0 truncate text-left font-mono text-xs text-neutral-500"
                            >
                              {d.dependency?.version ?? "—"}
                            </TooltipTrigger>
                            <TooltipContent>{d.dependency?.version ?? "—"}</TooltipContent>
                          </TooltipRoot>
                          <Show when={d.source !== ORIGEN_SISTEMA && reporte()?.runtimeVersions[d.id]}>
                            {(version) => (
                              <span class="block truncate text-caption text-neutral-500">
                                {t("settings.environment.required_version", { version: version() })}
                              </span>
                            )}
                          </Show>
                        </TableCell>
                        <TableCell>
                          <span class="flex min-w-0 items-center gap-1">
                            <span class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-500">
                              {d.dependency?.location ?? "—"}
                            </span>
                            <Show when={d.dependency}>
                              {(dependency) => (
                                <button
                                  type="button"
                                  class="grid size-5 shrink-0 place-items-center rounded-sm text-neutral-500 opacity-0 outline-none focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary hover:bg-surface-muted hover:text-neutral-950 group-hover:opacity-100 group-focus-within:opacity-100"
                                  aria-label={t("settings.environment.reveal_location", {
                                    label: d.label,
                                  })}
                                  title={t("settings.environment.reveal_location", { label: d.label })}
                                  onClick={() => void revelar(dependency())}
                                >
                                  <SquareArrowOutUpRight size={12} />
                                </button>
                              )}
                            </Show>
                          </span>
                        </TableCell>
                        <TableCell class="whitespace-nowrap text-right font-mono text-xs text-neutral-500">
                          {d.dependency?.bytes ?? d.bytes ? peso(d.dependency?.bytes ?? d.bytes ?? 0) : "—"}
                        </TableCell>
                        <TableCell class="text-xs text-neutral-500">
                          <span class="block truncate">{origin(d.source)}</span>
                          <span class="block truncate text-caption">
                            {status(d)}
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                  </For>
                </TableBody>
              </Table>
            </div>
          </SettingsBlock>
        </Show>
      </SettingsSection>
    </SettingsPanel>
  );
}
