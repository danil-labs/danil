import { For, Show, createSignal, type JSX } from "solid-js";
import { Badge, ProgressBar, Spinner } from "@danil/ui";
import { t } from "@danil/ui/i18n";

export interface AccountCardProps {
  name: string;
  plan?: string | null;
  detail?: string | null;
  active?: boolean;
  authenticated?: boolean;
  checkingStatus?: boolean;
  statusUnknown?: boolean;
  limits?: {
    mode?: "read" | "waiting" | "in_use" | "failed" | "revoked" | "no_account";
    what?: string;
    detail?: string;
    windows?: Array<{
      label: string;
      resets_at?: string | number;
      used_pct?: number;
      remaining_pct?: number;
    }>;
  };
  lastGood?: {
    fetched_at?: string | number;
    windows: Array<{
      label: string;
      resets_at?: string | number;
      used_pct?: number;
      remaining_pct?: number;
    }>;
  };
  loadingLimits?: boolean;
  refreshingLimits?: boolean;
  onRefreshLimits?: () => void | Promise<unknown>;
  onRecheckStatus?: () => void | Promise<unknown>;
  noLimitsLabel?: string;
  variant?: "card" | "row";
  actions?: JSX.Element;
  destructiveAction?: JSX.Element;
  class?: string;
}

/**
 * La representación única de una cuenta de agente.
 * Portada de apps/desktop/src/features/settings/AccountCard.tsx con datos por props.
 */
export function AccountCard(props: AccountCardProps) {
  const [refreshing, setRefreshing] = createSignal(false);
  const fila = () => props.variant === "row";
  const busy = () => refreshing() || props.refreshingLimits || props.checkingStatus;

  async function refreshAccount() {
    if (busy()) return;
    setRefreshing(true);
    try {
      await props.onRefreshLimits?.();
      await props.onRecheckStatus?.();
    } finally {
      setRefreshing(false);
    }
  }

  const hayLimites = () =>
    props.limits !== undefined ||
    props.lastGood !== undefined ||
    props.loadingLimits ||
    Boolean(props.onRefreshLimits || props.onRecheckStatus);

  const conexion = () => (
    <Show
      when={!props.checkingStatus}
      fallback={<StatusTag row={fila()}>{t("settings.account_card.checking")}</StatusTag>}
    >
      <Show
        when={!props.statusUnknown}
        fallback={
          <StatusTag row={fila()} tone="disconnected">
            {t("settings.account_card.unverified")}
          </StatusTag>
        }
      >
        <Show
          when={
            props.authenticated !== undefined &&
            !(fila() && props.authenticated)
          }
        >
          <StatusTag row={fila()} tone={props.authenticated ? "connected" : "disconnected"}>
            {props.authenticated
              ? t("settings.account_card.connected")
              : t("settings.account_card.disconnected")}
          </StatusTag>
        </Show>
      </Show>
    </Show>
  );

  return (
    <div
      class={`${
        fila()
          ? `flex flex-col gap-3 rounded-lg border bg-surface px-3.5 pt-3 pb-5 ${
              props.active ? "border-border-strong" : "border-border"
            }`
          : `flex flex-col gap-2 rounded-md border p-3 ${
              props.active
                ? "border-primary/50 bg-surface-raised"
                : "border-border bg-surface-muted"
            }`
      } ${props.class ?? ""}`.trim()}
      data-account-card=""
    >
      <div class={`flex ${fila() ? "items-center gap-2" : "items-start gap-3"}`}>
        <div class={`min-w-0 flex-1 ${fila() ? "mr-6 grid grid-cols-[minmax(0,1fr)] gap-[3px]" : ""}`}>
          <div class={`flex items-center ${fila() ? "min-w-0 gap-2" : "flex-wrap gap-1.5"}`}>
            <span
              class={`min-w-0 truncate ${
                fila() ? "text-sm font-semibold" : `text-xs ${props.active ? "font-semibold" : "font-medium"}`
              }`}
              title={props.name}
            >
              {props.name}
            </span>
            <Show when={props.plan}>
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
          <Show when={props.detail}>
            {(detalle) => (
              <p
                class={`m-0 truncate text-neutral-500 ${
                  fila() ? "text-ui leading-[19px]" : "mt-0.5 font-mono text-[0.68rem]"
                }`}
              >
                {detalle()}
              </p>
            )}
          </Show>
        </div>
        <Show when={fila() && props.active}>
          <StatusTag row tone="connected">{t("settings.account_card.active")}</StatusTag>
        </Show>
        <Show when={fila()}>{conexion()}</Show>
        <Show when={props.actions}>
          <div class={`flex shrink-0 ${fila() ? "gap-2" : "gap-1"}`}>{props.actions}</div>
        </Show>
      </div>

      <Show when={hayLimites()}>
        <div
          class={`flex flex-col ${
            fila() ? "gap-2.5" : "gap-1.5 border-t border-border pt-2"
          }`}
        >
          <Show when={!props.limits && props.loadingLimits}>
            <p class="m-0 flex items-center text-xs text-neutral-500">
              <Spinner size={11} label={t("settings.account_card.asking")} />
            </p>
          </Show>

          <Show when={props.limits?.windows && props.limits.windows.length > 0}>
            <ul class={`m-0 flex list-none flex-col p-0 ${fila() ? "gap-2.5" : "gap-1.5"}`}>
              <For each={props.limits!.windows}>
                {(ventana) => {
                  const resta = () => ventana.remaining_pct ?? (100 - (ventana.used_pct ?? 0));
                  return (
                    <li class="flex flex-col gap-1">
                      <div class="flex items-baseline gap-2 text-xs">
                        <span class="min-w-0 truncate text-neutral-700">{ventana.label}</span>
                        <span class="ml-auto shrink-0 whitespace-nowrap tabular-nums text-neutral-500">
                          {resta()}% {t("settings.account_card.remaining")}
                        </span>
                      </div>
                      <ProgressBar
                        class={fila() ? "bg-neutral-200" : "h-1 bg-border"}
                        value={resta()}
                        max={100}
                        label={`${props.name}: ${resta()}%`}
                      />
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>

          <Show when={props.onRefreshLimits || props.onRecheckStatus}>
            <div class="flex min-h-6 items-center gap-2">
              <button
                type="button"
                class="ml-auto grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 hover:bg-surface hover:text-neutral-950 disabled:opacity-60"
                disabled={busy()}
                aria-label={t("settings.account_card.refresh_account")}
                title={t("settings.account_card.refresh_account")}
                onClick={() => void refreshAccount()}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class={busy() ? "animate-spin" : ""}
                >
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M8 16H3v5" />
                </svg>
              </button>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={props.destructiveAction}>
        <div
          class={`flex flex-wrap items-center gap-2 text-xs text-neutral-500 ${
            !fila() ? "border-t border-border pt-2" : ""
          }`}
        >
          {props.destructiveAction}
        </div>
      </Show>
    </div>
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
        class={`shrink-0 rounded-sm px-1.5 py-px text-[0.68rem] font-semibold ${
          tono() === "neutral" ? "bg-surface text-neutral-500" : ""
        } ${
          tono() === "active" ? "bg-primary/15 text-primary" : ""
        } ${
          tono() === "connected" ? "bg-success/15 text-success-strong" : ""
        } ${
          tono() === "disconnected" ? "bg-warning/15 text-warning-strong" : ""
        }`.trim()}
      >
        {props.children}
      </span>
    </Show>
  );
}
