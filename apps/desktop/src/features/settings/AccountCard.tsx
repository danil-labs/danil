import { For, Show, createSignal, type JSX } from "solid-js";
import AlertTriangle from "lucide-solid/icons/triangle-alert";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import { type CredentialState, credentialState } from "@terminus/protocol";
import { SESION_INICIADA, type Account, type AccountStatus } from "./accounts-store";
import { Badge } from "../../ui/Badge";
import { ProgressBar } from "../../ui/ProgressBar";
import {
  type Query,
  type Read,
  cuandoVuelve,
  haceCuanto,
  left,
  legible,
  tono,
} from "../../lib/limits";
import { cn } from "../../lib/utils";
import { prosa } from "../../lib/prose";
import { t } from "../../lib/i18n";
import { Spinner } from "../../ui/Spinner";
import { createNow } from "../../lib/sharedClock";

/**
 * La representación única de una cuenta de agente.
 *
 * Configuración decide qué cuentas entran y aporta acciones; el popover de la
 * franja decide enseñar solo las activas y no aporta ninguna. La identidad, el
 * plan, el estado y las ventanas se componen aquí para que esos dos lugares no
 * puedan volver a contar cosas distintas sobre la misma cuenta.
 */
export default function AccountCard(props: {
  account: Account;
  active: boolean;
  status?: AccountStatus;
  checkingStatus?: boolean;
  /**
   * El estado de la credencial (`credentialState`), cuando quien monta la tarjeta
   * sabe cómo falló su última consulta. Sin él se decide aquí con la misma función,
   * a partir de `status` y `limits`.
   */
  credential?: CredentialState;
  limits?: Query;
  lastGood?: Read;
  loadingLimits?: boolean;
  refreshingLimits?: boolean;
  onRefreshLimits?: () => void | Promise<unknown>;
  onRecheckStatus?: () => void | Promise<unknown>;
  noLimitsLabel?: string;
  /** `row` es la fila de Configuración; el popover de la franja usa la tarjeta. */
  variant?: "card" | "row";
  actions?: JSX.Element;
  destructiveAction?: JSX.Element;
}) {
  const [refreshing, setRefreshing] = createSignal(false);
  const now = createNow();
  const waitMinutes = () => {
    const limits = props.limits;
    return limits?.mode === "waiting"
      ? Math.max(0, Math.ceil((limits.retry_at - now()) / 60_000))
      : 0;
  };
  const busy = () => refreshing() || props.refreshingLimits || props.checkingStatus;
  async function refreshAccount() {
    if (busy() || waitMinutes() > 0) return;
    setRefreshing(true);
    try {
      await props.onRefreshLimits?.();
      await props.onRecheckStatus?.();
    } finally {
      setRefreshing(false);
    }
  }
  const presentacion = () =>
    accountPresentation(props.account, props.status, props.limits, props.lastGood);
  const credencial = (): CredentialState =>
    props.credential ??
    credentialState({ status: props.status, limits: props.limits });
  // Una espera con la última lectura cuenta como leída: sin atenuar, y el aviso
  // pasa a ser una nota de cuándo se actualiza.
  const leido = () => legible(props.limits);
  const vieja = () => !leido() && props.lastGood !== undefined;
  const fuente = () => leido() ?? props.lastGood;
  const hayLimites = () =>
    props.limits !== undefined ||
    props.lastGood !== undefined ||
    props.loadingLimits ||
    props.onRefreshLimits || props.onRecheckStatus;
  const fila = () => props.variant === "row";
  const conexion = () => {
    if (props.checkingStatus) return <StatusTag row={fila()}>{t("settings.account_card.checking")}</StatusTag>;
    const c = credencial();
    switch (c.kind) {
      // En la fila solo se nombra la cuenta caída; «activa» ya dice cuál se usa.
      case "connected":
        return fila() ? null : <StatusTag tone="connected">{t("settings.account_card.connected")}</StatusTag>;
      case "disconnected":
        return <StatusTag row={fila()} tone="disconnected">{t("settings.account_card.disconnected")}</StatusTag>;
      case "unknown":
        // Apagada no es una falla: la credencial está como estaba y se mira al encenderla.
        if (c.why === "machine_off") return <StatusTag row={fila()}>{t("settings.account_card.machine_off")}</StatusTag>;
        // Ilegible lo explica su aviso de abajo.
        if (c.why === "unreadable") return null;
        return <StatusTag row={fila()} tone="disconnected">{t("settings.account_card.unverified")}</StatusTag>;
      case "pending":
        return null;
      default: {
        const never: never = c;
        return never;
      }
    }
  };

  return (
    // Sin este borde y fondo, la tarjeta en uso vuelve a verse igual a las
    // otras dos: la insignia sola no alcanza a distinguirla.
    <li
      class={cn(
        fila()
          ? [
              "flex flex-col gap-3 rounded-lg border bg-surface px-3.5 pt-3 pb-5",
              props.active ? "border-border-strong" : "border-border",
            ]
          : [
              "flex flex-col gap-2 rounded-md border p-3",
              props.active
                ? "border-primary/50 bg-surface-raised"
                : "border-border bg-surface-muted",
            ],
      )}
    >
      <div class={cn("flex", fila() ? "items-center gap-2" : "items-start gap-3")}>
        <div class={cn("min-w-0 flex-1", fila() && "mr-6 grid gap-[3px]")}>
          <div class={cn("flex flex-wrap items-center", fila() ? "gap-2" : "gap-1.5")}>
            <span
              class={cn(
                "min-w-0 truncate",
                fila()
                  ? "text-sm font-semibold"
                  : ["text-xs", props.active ? "font-semibold" : "font-medium"],
              )}
              title={presentacion().name}
            >
              {presentacion().name}
            </span>
            {/* **El plan va pegado al nombre, no al final de la fila.** Es parte
                de con qué cuenta estás trabajando —«alguien@ejemplo.test, max»— y
                estaba detrás de las etiquetas de estado, que son de otra cosa:
                lo que la cuenta *es* separado de lo que le *pasa*, y con dos o
                tres etiquetas en medio la fila se partía y el plan caía solo en
                el segundo renglón. */}
            <Show when={presentacion().plan}>
              {(plan) => (
                <span class="shrink-0 font-mono text-[0.68rem] text-neutral-500">
                  {plan()}
                </span>
              )}
            </Show>
            <Show when={props.active && !fila()}>
              <StatusTag tone="active">{t("settings.account_card.active")}</StatusTag>
            </Show>
            <Show when={!fila()}>{conexion()}</Show>
          </div>
          <Show when={presentacion().detail}>
            {(detalle) => (
              <p
                class={cn(
                  "m-0 truncate text-neutral-500",
                  fila()
                    ? "text-ui leading-[19px]"
                    : "mt-0.5 font-mono text-[0.68rem]",
                )}
              >
                {detalle()}
              </p>
            )}
          </Show>
          <Show when={props.status?.unreadable}>
            {(f) => (
              <div class="mt-1 flex items-start gap-2">
                {/* Misma forma que el fallo de límites de abajo —frase arriba,
                    dato de máquina en mono— y no `FailureNote`, que es el bloque
                    de una pantalla: sus 13 px y su relleno no caben en una
                    tarjeta donde el error de al lado mide 12. */}
                <p class="m-0 flex min-w-0 flex-1 flex-col gap-0.5 text-xs text-warning-strong">
                  <span class="flex items-start gap-1">
                    <AlertTriangle size={11} class="mt-0.5 shrink-0" aria-hidden />
                    {prosa(f().what)}
                  </span>
                  <Show when={f().detail}>
                    <span class="font-mono text-[0.68rem] text-neutral-500">
                      {f().detail}
                    </span>
                  </Show>
                </p>

              </div>
            )}
          </Show>
        </div>
        <Show when={fila() && props.active}>
          <StatusTag row tone="connected">{t("settings.account_card.active")}</StatusTag>
        </Show>
        <Show when={fila()}>{conexion()}</Show>
        <Show when={props.actions}>
          <div class={cn("flex shrink-0", fila() ? "gap-2" : "gap-1")}>{props.actions}</div>
        </Show>
      </div>

      <Show when={hayLimites()}>
        <div
          class={cn(
            "flex flex-col",
            fila() ? "gap-2.5" : "gap-1.5 border-t border-border pt-2",
          )}
        >
          {/* Mismo idioma que la franja de abajo: mientras pregunta, un giro;
              cuando todavía no preguntó, se dice, porque eso no es carga sino
              un estado que se queda. */}
          <Show when={!props.limits}>
            <p class="m-0 flex items-center text-xs text-neutral-500">
              <Show
                when={props.loadingLimits}
                fallback={<span>{t("settings.account_card.not_asked")}</span>}
              >
                <Spinner size={11} label={t("settings.account_card.asking")} />
              </Show>
            </p>
          </Show>

          <Show when={props.limits?.mode === "no_account" ? props.limits : null}>
            {(q) => (
              <p class="m-0 text-xs text-neutral-500" title={q().what}>
                {props.noLimitsLabel ?? t("settings.account_card.disconnected")}
              </p>
            )}
          </Show>

          <Show when={props.limits?.mode === "waiting" && !leido()}>
            <p class="m-0 text-xs text-warning-strong" role="status">
              {waitMinutes() > 0
                ? t("settings.account_card.retry_wait", { count: waitMinutes() })
                : t("settings.account_card.retry_ready")}
            </p>
          </Show>

          <Show when={props.limits?.mode === "in_use"}>
            <p class="m-0 text-xs text-neutral-500">
              {t("settings.account_card.in_use")}
            </p>
          </Show>

          <Show
            when={
              props.limits?.mode === "failed" || props.limits?.mode === "revoked"
                ? props.limits
                : null
            }
          >
            {(q) => (
              <p class="m-0 flex flex-col gap-0.5 text-xs text-warning-strong">
                <span class="flex items-center gap-1">
                  <AlertTriangle size={11} aria-hidden />
                  {q().what}
                </span>
                <span class="font-mono text-[0.68rem] text-neutral-500">
                  {q().detail}
                </span>
              </p>
            )}
          </Show>

          <Show when={fuente()?.windows.length ? fuente() : null}>
            {(f) => (
              <ul
                class={cn(
                  "m-0 flex list-none flex-col p-0",
                  fila() ? "gap-2.5" : "gap-1.5",
                  vieja() && "opacity-60",
                )}
              >
                <For each={f().windows}>
                  {(ventana) => {
                    const resta = () => left(ventana);
                    const vuelve = () =>
                      cuandoVuelve(ventana.resets_at, ventana.used_pct);

                    return (
                      <li class="flex flex-col gap-1">
                        <Show
                          when={fila()}
                          fallback={
                            <div class="flex items-baseline gap-2 text-xs">
                              <span class="shrink-0 whitespace-nowrap text-neutral-500">
                                <span class="font-mono tabular-nums text-neutral-950">
                                  {resta()}%
                                </span>{" "}
                                {t("settings.account_card.remaining")}
                              </span>
                              <span class="min-w-0 truncate">{ventana.label}</span>
                              <span class="ml-auto shrink-0 text-neutral-500">
                                {vuelve()}
                              </span>
                            </div>
                          }
                        >
                          <div class="flex items-baseline gap-2 text-xs">
                            <span class="min-w-0 truncate text-neutral-700">{ventana.label}</span>
                            <span class="ml-auto shrink-0 whitespace-nowrap tabular-nums text-neutral-500">
                              {t("settings.account_card.window_left", {
                                left: resta(),
                                when: vuelve(),
                              })}
                            </span>
                          </div>
                        </Show>
                        <ProgressBar
                          class={fila() ? "bg-neutral-200" : "h-1 bg-border"}
                          value={resta()}
                          max={100}
                          barClass={tono(resta())}
                          label={t("settings.account_card.progress", {
                            name: presentacion().name,
                            left: resta(),
                            window: ventana.label,
                            when: vuelve(),
                          })}
                        />
                      </li>
                    );
                  }}
                </For>
              </ul>
            )}
          </Show>

          <div class="flex min-h-6 items-center gap-2">
            {/* **Solo cuando el dato es viejo.** «leído hace un momento» salía en
                cada cuenta para decir que todo estaba bien, que es la definición
                de un renglón que no hace falta: la franja se relee sola cada
                cinco minutos, así que fresco es el caso normal y no una noticia.
                Lo que sí es una noticia es que la última lectura fallara y esto
                sea de antes — eso es retroalimentación y se queda. */}
            <Show when={vieja() ? fuente() : null}>
              {(f) => (
                <span class="text-[0.68rem] text-neutral-500">
                  {t("settings.account_card.stale", { when: haceCuanto(f().fetched_at) })}
                </span>
              )}
            </Show>
            {/* El proveedor frenó las consultas, pero hay número que enseñar: el
                aviso se queda en nota y no tapa las barras. */}
            <Show when={props.limits?.mode === "waiting" && leido() && waitMinutes() > 0}>
              <span class="text-[0.68rem] text-neutral-500" role="status">
                {t("settings.account_card.refresh_in", { count: waitMinutes() })}
              </span>
            </Show>
            <Show when={props.onRefreshLimits || props.onRecheckStatus}>
              <button
                class="ml-auto grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 hover:bg-surface hover:text-neutral-950 disabled:opacity-60"
                disabled={busy() || waitMinutes() > 0}
                aria-label={t("settings.account_card.refresh_account")}
                title={t("settings.account_card.refresh_account")}
                onClick={() => void refreshAccount()}
              >
                <RefreshCw
                  size={13}
                  class={cn(busy() && "animate-spin")}
                />
              </button>
            </Show>
          </div>
        </div>
      </Show>

      <Show when={props.destructiveAction}>
        <div
          class={cn(
            "flex flex-wrap items-center gap-2 text-xs text-neutral-500",
            !fila() && "border-t border-border pt-2",
          )}
        >
          {props.destructiveAction}
        </div>
      </Show>
    </li>
  );
}

const TONO_DE_FILA = {
  neutral: "neutral",
  active: "active",
  connected: "success",
  disconnected: "warning",
} as const;

function StatusTag(props: {
  children: JSX.Element;
  tone?: "neutral" | "active" | "connected" | "disconnected";
  row?: boolean;
}) {
  const tono = () => props.tone ?? "neutral";

  return (
    <Show
      when={!props.row}
      fallback={
        <Badge class="shrink-0" tone={TONO_DE_FILA[tono()]}>
          {props.children}
        </Badge>
      }
    >
      <span
        class={cn("shrink-0 rounded-sm px-1.5 py-px text-[0.68rem] font-semibold",
          tono() === "neutral" && ["bg-surface", "text-neutral-500"],
          // Compartir el verde de «conectada» con «activa» vuelve la insignia
          // de la que está en uso ilegible: dos iguales pegadas.
          tono() === "active" && ["bg-primary/15", "text-primary"],
          tono() === "connected" && ["bg-success/15", "text-success-strong"],
          tono() === "disconnected" && ["bg-warning/15", "text-warning-strong"],
        )}
      >
        {props.children}
      </span>
    </Show>
  );
}

/**
 * `account_status` persiste la identidad que acaba de leer, pero el objeto que
 * ya devolvió `list_accounts` no cambia retroactivamente. Mientras llega la
 * siguiente lista, `detail` es la lectura fresca y tiene prioridad sobre la
 * etiqueta de relleno.
 */
export function accountPresentation(
  account: Account,
  status?: AccountStatus,
  limits?: Query,
  lastGood?: Read,
) {
  const detail = status?.detail.trim() ?? "";
  const [detailName = "", detailPlan = ""] = detail.split(" · ", 2);
  const statusIdentity =
    status?.authenticated && detailName && detailName !== SESION_INICIADA
      ? detailName
      : "";
  const name = statusIdentity || account.identity?.trim() || account.label;
  const read = limits?.mode === "read" ? limits : lastGood;
  const plan = read?.plan?.trim() || (statusIdentity ? detailPlan.trim() : "") || null;
  const visibleDetail =
    detail && detail !== name && detail !== `${name} · ${plan}` ? detail : null;
  return { name, plan, detail: visibleDetail };
}
