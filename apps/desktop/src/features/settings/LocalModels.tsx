/** El panel de modelos locales que montan el alta y Configuración: llama.cpp arriba y el catálogo debajo. */
import { confirm } from "@tauri-apps/plugin-dialog";
import Check from "lucide-solid/icons/check";
import Code from "lucide-solid/icons/code";
import Cpu from "lucide-solid/icons/cpu";
import MessageSquare from "lucide-solid/icons/message-square";
import { For, Match, Show, Switch, type JSX } from "solid-js";
import { peso } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { RemoveButton } from "../../ui/IconAction";
import { Spinner } from "../../ui/Spinner";
import { AvanceDeDescarga, BarraDeCarga, Peso } from "../onboarding/DownloadProgress";
import { type ModeloLocal, type ModelosLocales, OPERACION } from "./local-models-store";
import "../../locales/settingsPhrases";

/** La memoria se lee en gigas enteros: «16 GB», no «15.5 GB». */
const gb = (b: number) => `${Math.max(1, Math.round(b / 1_073_741_824))} GB`;

/** Una fila con la forma de las tarjetas del alta: icono, nombre, una línea y acciones a la derecha. */
function Fila(props: {
  icono: JSX.Element;
  nombre: JSX.Element;
  linea: JSX.Element;
  aviso?: boolean;
  resaltada?: boolean;
  lista?: boolean;
  barra?: { hecho: number; total: number | null } | null;
  children: JSX.Element;
}) {
  return (
    <div
      class={cn(
        "relative flex min-h-16 items-center gap-3 overflow-hidden rounded-lg border px-3.5 py-2.5",
        props.resaltada
          ? "border-primary bg-primary/5"
          : props.lista
            ? "border-success-strong/40 bg-success/5"
            : "border-border bg-surface-raised",
      )}
    >
      <span class="grid size-[26px] shrink-0 place-items-center rounded-md bg-surface-muted text-neutral-950">
        {props.icono}
      </span>
      <span class="grid min-w-0 flex-1 gap-1">
        <strong class="flex min-w-0 items-center gap-1 text-ui leading-[1.2] font-semibold text-neutral-950">
          {props.nombre}
        </strong>
        <span class={cn("truncate text-caption", props.aviso ? "text-warning-strong" : "text-neutral-500")}>
          {props.linea}
        </span>
      </span>
      <span class="flex shrink-0 items-center justify-end gap-1.5">{props.children}</span>
      <Show when={props.barra}>{(b) => <BarraDeCarga hecho={b().hecho} total={b().total} />}</Show>
    </div>
  );
}

function Etiqueta(props: { children: JSX.Element }) {
  return (
    <span class="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-2xs font-medium text-primary">
      {props.children}
    </span>
  );
}

/** llama.cpp arriba y los modelos debajo, con su peso, la memoria que piden y cuál usan las tareas. */
export default function ListaDeModelosLocales(props: { m: ModelosLocales; memoria?: boolean }) {
  const m = props.m;
  const ninguno = () => m.leido() && !m.modelos().some((x) => x.state === "installed");

  function lineaDeModelo(x: ModeloLocal) {
    const p = m.progreso[x.id];
    if (p?.kind === "verifying") return t("settings.accounts.local.verifying");
    if (m.bajando(x.id)) {
      return t("settings.accounts.local.downloading", { done: peso(p?.on_disk ?? 0), total: peso(x.bytes) });
    }
    if (x.state === "partial") {
      return t("settings.accounts.local.partial", { done: peso(x.on_disk), total: peso(x.bytes) });
    }
    if (!x.fits) return t("settings.accounts.local.too_big", { memory: gb(x.memory), machine: gb(x.machine_memory) });
    return t("settings.accounts.local.memory", { memory: gb(x.memory) });
  }

  return (
    <div class="grid gap-2">
      <Show when={m.error()}>
        {(e) => (
          <p class="m-0 text-xs text-error-strong" role="alert">
            {e()}
          </p>
        )}
      </Show>
      <Fila
        icono={<Cpu size={15} aria-hidden="true" />}
        nombre={<span class="truncate">llama.cpp</span>}
        linea={
          m.motorListo()
            ? m.motor()?.source === "system"
              ? t("settings.accounts.local.runtime_system")
              : t("settings.accounts.local.runtime_ready")
            : t("settings.accounts.local.runtime_missing")
        }
        resaltada={m.bajandoMotor() !== null}
        lista={m.motorListo()}
        barra={(() => {
          const b = m.bajandoMotor();
          return b ? { hecho: b.hecho, total: b.total || null } : null;
        })()}
      >
        <Switch
          fallback={
            <>
              <Peso bytes={m.pesoDelMotor()} />
              <Button size="compact" variant="secondary" disabled={!m.leido()} onClick={() => void m.instalarMotor()}>
                {t("settings.accounts.local.download")}
              </Button>
            </>
          }
        >
          <Match when={m.bajandoMotor()}>
            <AvanceDeDescarga
              total={m.pesoDelMotor()}
              cancelar={t("onboarding.ai.cancel_download", { name: "llama.cpp" })}
              onCancelar={m.cancelarMotor}
            />
          </Match>
          <Match when={m.ocupado() === OPERACION}>
            <Spinner class="text-neutral-500" />
          </Match>
          <Match when={m.motorListo()}>
            <Badge tone="success" class="gap-1">
              <Check size={11} stroke-width={3} aria-hidden="true" />
              {t("settings.accounts.local.ready")}
            </Badge>
            <Show when={m.motor()?.source === "managed"}>
              <RemoveButton
                icon="trash"
                label={t("settings.accounts.local.remove_named", { label: "llama.cpp" })}
                onClick={() => void m.quitarMotor()}
              />
            </Show>
          </Match>
        </Switch>
      </Fila>

      <Show when={ninguno()}>
        <p class="m-0 mt-1 text-xs text-neutral-500">{t("settings.accounts.local.none")}</p>
      </Show>

      <For each={m.modelos()}>
        {(x) => {
          const nombre = () => `${x.label} · ${x.quant}`;
          return (
            <Fila
              icono={x.kind === "code" ? <Code size={15} aria-hidden="true" /> : <MessageSquare size={15} aria-hidden="true" />}
              nombre={
                <>
                  <span class="truncate">{x.label}</span>
                  <Show when={x.recommended}>
                    <Etiqueta>{t("settings.accounts.local.recommended")}</Etiqueta>
                  </Show>
                  <Show when={x.kind === "code"}>
                    <Etiqueta>{t("settings.accounts.local.code")}</Etiqueta>
                  </Show>
                </>
              }
              linea={lineaDeModelo(x)}
              aviso={!x.fits && x.state !== "installed" && !m.bajando(x.id)}
              resaltada={m.bajando(x.id)}
              lista={x.active && x.state === "installed"}
              barra={
                m.bajando(x.id)
                  ? {
                      hecho: m.progreso[x.id]?.kind === "verifying" ? x.bytes : (m.progreso[x.id]?.on_disk ?? 0),
                      total: x.bytes,
                    }
                  : null
              }
            >
              <Switch
                fallback={
                  <>
                    <span class="text-caption whitespace-nowrap text-neutral-500 tabular-nums">{peso(x.bytes)}</span>
                    <Button
                      size="compact"
                      variant={x.recommended && ninguno() ? "primary" : "secondary"}
                      onClick={() => void m.descargar(x)}
                    >
                      {x.state === "partial" ? t("settings.accounts.local.resume") : t("settings.accounts.local.download")}
                    </Button>
                  </>
                }
              >
                <Match when={x.state === "blocked"}>
                  <Badge>{t("settings.accounts.local.blocked")}</Badge>
                </Match>
                <Match when={m.bajando(x.id)}>
                  <AvanceDeDescarga
                    total={x.bytes}
                    cancelar={t("onboarding.ai.cancel_download", { name: nombre() })}
                    onCancelar={m.progreso[x.id]?.kind === "progress" ? () => m.cancelar(x) : undefined}
                  />
                </Match>
                <Match when={m.ocupado() === x.id}>
                  <Spinner class="text-neutral-500" />
                </Match>
                <Match when={x.state === "installed"}>
                  <Show
                    when={x.active}
                    fallback={
                      <Button size="compact" variant="secondary" onClick={() => void m.usar(x)}>
                        {t("settings.accounts.local.use")}
                      </Button>
                    }
                  >
                    <Badge tone="success" class="gap-1">
                      <Check size={11} stroke-width={3} aria-hidden="true" />
                      {t("settings.accounts.local.in_use")}
                    </Badge>
                  </Show>
                  <RemoveButton
                    icon="trash"
                    label={t("settings.accounts.local.remove_named", { label: x.label })}
                    onClick={() =>
                      void confirm(t("settings.accounts.local.remove_confirm", { label: x.label, size: peso(x.bytes) }), {
                        kind: "warning",
                      }).then((si) => {
                        if (si) void m.borrar(x);
                      })
                    }
                  />
                </Match>
              </Switch>
            </Fila>
          );
        }}
      </For>

      {/* Apagar es del motor y no de un modelo: puede tener dos dentro a la vez. */}
      <Show when={props.memoria && m.modelos().filter((x) => x.serving).length}>
        {(n) => (
          <div class="flex items-center justify-between gap-2 pt-1 text-xs text-neutral-500">
            <span>{t("settings.accounts.local.in_memory", { count: n() })}</span>
            <Button size="compact" variant="outline" onClick={() => void m.apagar()}>
              {t("settings.accounts.local.stop_engine")}
            </Button>
          </div>
        )}
      </Show>
    </div>
  );
}
