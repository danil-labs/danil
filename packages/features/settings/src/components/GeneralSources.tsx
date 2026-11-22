import RefreshCw from "lucide-solid/icons/refresh-cw";
import Trash2 from "lucide-solid/icons/trash-2";
import { For, Match, Show, Switch } from "solid-js";
import { df } from "../../../../../apps/desktop/src/lib/format";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { Source } from "../../../../../apps/desktop/src/lib/model";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { MarcaFuente, repoDe } from "../../../../ui/src/sources";
import { SettingsBlock } from "../../../../ui/src/SettingsLayout";

// Ajustes generales; el contexto principal y los secundarios pertenecen al workspace activo.

// Fuentes locales y remotas pueden tener el mismo nombre; origen permite distinguirlas.
// El estado de frescura conserva el caso desconocido: un fallo de consulta no significa al día.
export type Freshness = {
  id: string;
  estado: "al-dia" | "atrasada" | "sin-saber";
  local?: string;
  porque?: string;
};

export type SourceDetail = {
  id: string;
  remoto?: string;
  detras?: number;
  porque?: string;
};

// El backend aporta fechas sin formato; la configuración regional se aplica en la interfaz.
function formatDate(v: string | undefined): string | null {
  if (!v) return null;
  const d = new Date(Number(v) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return df({ dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function SourceRow(props: {
  f: Source;
  onRemove: (id: string) => void;
  freshness?: Freshness;
  onUpdate?: (id: string) => void;
  updating?: boolean;
  detail?: SourceDetail;
}) {
  const origin = () =>
    props.f.kind === "git" ? repoDe(props.f.location) : null;
  // Dos ramas del mismo repositorio son fuentes distintas; omitir la rama las vuelve indistinguibles.
  const branch = () => (props.f.kind === "git" ? props.f.branch?.trim() || null : null);
  const showUsage = () => !props.f.root || origin() || props.f.projects.length > 0;

  return (
    <SettingsBlock>
      <div class="flex min-w-0 items-center gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <MarcaFuente location={props.f.location} kind={props.f.kind} />
          <span class="min-w-0 truncate text-sm font-medium">{props.f.name}</span>
          <Show when={branch()}>
            {(r) => (
              // Con tope y cortada: una rama larga sacaba de la fila los botones.
              <Badge forma="dato" class="min-w-0 max-w-48 font-mono" title={r()}>
                <span class="truncate">{r()}</span>
              </Badge>
            )}
          </Show>
          <Show when={props.f.root}>
            <Badge class="shrink-0">{t("settings.general.source.root")}</Badge>
          </Show>
          <Show when={props.f.missing}>
            <Badge tone="warning" class="shrink-0">{t("settings.general.source.missing")}</Badge>
          </Show>
        </div>
        <Show when={props.onUpdate && props.f.kind === "git"}>
          <Button
            variant="ghost"
            size="icon"
            class="size-7 shrink-0"
            disabled={props.updating}
            onClick={() => props.onUpdate?.(props.f.id)}
            aria-label={
              props.updating
                ? t("settings.general.source.fetching")
                : t("settings.general.source.fetch")
            }
            title={t("settings.general.source.fetch_title")}
          >
            <RefreshCw size={14} class={cn(props.updating && "animate-spin")} />
          </Button>
        </Show>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 text-error-strong"
          onClick={() => props.onRemove(props.f.id)}
          aria-label={t("settings.general.source.delete", { name: props.f.etiqueta })}
          title={t("settings.general.source.delete_title")}
        >
          <Trash2 size={14} />
        </Button>
      </div>
      <div class="grid gap-1 text-xs text-neutral-500">
        <Show when={showUsage()}>
          <div class="flex flex-wrap items-center gap-1">
            <Show when={origin()}>
              {(o) => <span class="font-mono">{o()}</span>}
            </Show>
            <For each={props.f.projects}>
              {(n) => <Badge forma="dato" class="text-2xs">{n}</Badge>}
            </For>
            {/* El contexto principal se consume siempre; su lista de proyectos no mide ese uso. */}
            <Show when={!props.f.root}>
              <span>
                {props.f.projects.length === 0
                  ? t("settings.general.source.unused")
                  : t("settings.general.source.used", { count: props.f.sessions })}
              </span>
            </Show>
          </div>
        </Show>

        <Show when={formatDate(props.f.traido_en)}>
          {(c) => (
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span>{t("settings.general.source.updated_on", { when: c() })}</span>
              {/* undefined no equivale a cero: un clon superficial puede impedir contar commits pendientes. */}
              <Switch>
                <Match when={(props.detail?.detras ?? 0) > 0}>
                  <span class="text-warning-strong">
                    ·{" "}
                    {t("settings.general.source.behind", {
                      count: props.detail?.detras ?? 0,
                    })}
                  </span>
                </Match>
                <Match when={props.detail?.detras === 0}>
                  <span>· {t("settings.general.source.uptodate")}</span>
                </Match>
                <Match when={props.detail?.remoto && props.detail?.detras === undefined}>
                  <span>· {t("settings.general.source.shallow")}</span>
                </Match>
                <Match when={props.detail?.porque}>
                  <span>
                    · {t("settings.general.source.remote_failed")}:{" "}
                    {props.detail?.porque}
                  </span>
                </Match>
                <Match when={props.freshness?.estado === "al-dia"}>
                  <span>· {t("settings.general.source.uptodate")}</span>
                </Match>
                <Match when={props.freshness?.estado === "atrasada"}>
                  <span class="text-warning-strong">
                    · {t("settings.general.source.behind_unknown")}
                  </span>
                </Match>
                <Match when={props.freshness?.estado === "sin-saber"}>
                  <span>
                    · {t("settings.general.source.check_failed")}:{" "}
                    {props.freshness?.porque}
                  </span>
                </Match>
              </Switch>
            </div>
          )}
        </Show>
      </div>
    </SettingsBlock>
  );
}
