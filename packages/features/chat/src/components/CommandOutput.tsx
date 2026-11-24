import Check from "lucide-solid/icons/check";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { type JSX, Match, Show, Switch } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { formatearDuracion } from "../../../../ui/src/lib/steps";
import { formatTokens } from "../../../../ui/src/lib/usage";
import { MarcaAgente } from "../../../../ui/src/icons";
import { Markdown } from "../../../../ui/src/Markdown";
import { type ClaseDeSalida, comandoEscrito, esMarkdown } from "../model/slashOutput";
import { Spinner } from "../../../../ui/src/Spinner";

/**
 * Lo que el CLI contestó a un comando de barra. No lo dijo el agente ni la
 * app: la cabecera nombra el comando y de qué CLI salió la respuesta.
 */
export default function SalidaDeComando(props: {
  text: string;
  /** El comando tal como se escribió; vacío si el hilo ya no lo tiene. */
  command: string;
  agent: string;
  agentLabel: string;
  clase: ClaseDeSalida;
  durationMs?: number;
}) {
  const escrito = () => comandoEscrito(props.command) || props.command;
  return (
    <Switch fallback={<Tarjeta {...props}><Salida text={props.text} /></Tarjeta>}>
      <Match when={props.clase === "terminal_only"}>
        <Aviso
          texto={t("chat.command.terminal_only", { agent: props.agentLabel, command: escrito() })}
          nota={t("chat.command.not_sent")}
          clase="terminal-only"
        />
      </Match>
      <Match when={props.clase === "failed"}>
        <Aviso
          texto={
            escrito() === "/compact"
              ? t("chat.command.compact_failed", { reason: props.text })
              : t("chat.command.failed", { command: escrito(), reason: props.text })
          }
          clase="failed"
        />
      </Match>
      <Match when={props.clase === "running"}>
        <Tarjeta
          {...props}
          derecha={
            <span class="flex shrink-0 items-center gap-1.5 text-xs text-neutral-700">
              <Spinner size={13} class="text-primary" />
              {t("chat.command.compacting")}
            </span>
          }
        />
      </Match>
      <Match when={props.clase === "compacted"}>
        <Tarjeta
          {...props}
          derecha={
            <Show when={props.durationMs}>
              {(ms) => <span class="shrink-0 text-caption text-neutral-500">{formatearDuracion(ms())}</span>}
            </Show>
          }
        >
          <p class="m-0 flex min-w-0 items-center gap-1.5 text-ui">
            <Check size={14} class="shrink-0 text-success-strong" aria-hidden="true" />
            <span class="font-semibold text-neutral-950">{t("chat.command.compacted")}</span>
            <Show when={Number(props.text) > 0}>
              <span class="text-neutral-500">
                · {t("chat.command.compacted_from", { tokens: formatTokens(Number(props.text)) })}
              </span>
            </Show>
          </p>
        </Tarjeta>
      </Match>
      <Match when={props.clase === "empty"}>
        <Tarjeta {...props}>
          <p class="m-0 text-ui text-neutral-500">
            {t("chat.command.empty", { command: props.text || escrito() })}
          </p>
        </Tarjeta>
      </Match>
    </Switch>
  );
}

function Aviso(props: { texto: string; nota?: string; clase: string }) {
  return (
    <article
      class="col-start-1 grid min-w-0 gap-1 rounded-lg border border-warning/35 bg-warning/[0.06] px-3 py-2.5"
      data-sender="system"
      data-command-output={props.clase}
    >
      <p class="m-0 flex min-w-0 items-start gap-2 text-ui text-neutral-950">
        <TriangleAlert size={14} class="mt-0.5 shrink-0 text-warning-strong" aria-hidden="true" />
        <span class="min-w-0 break-words">{props.texto}</span>
      </p>
      <Show when={props.nota}>
        <p class="m-0 text-xs text-neutral-500">{props.nota}</p>
      </Show>
    </article>
  );
}

function Tarjeta(props: {
  command: string;
  agent: string;
  agentLabel: string;
  clase: ClaseDeSalida;
  derecha?: JSX.Element;
  children?: JSX.Element;
}) {
  return (
    <article
      class="col-start-1 min-w-0 overflow-hidden rounded-lg border border-border bg-surface-raised"
      data-sender="system"
      data-command-output={props.clase}
    >
      <header class="flex h-[34px] min-w-0 items-center gap-2 bg-surface-muted px-3">
        <span class="flex size-3.5 shrink-0 items-center justify-center">
          <MarcaAgente id={props.agent} size={14} />
        </span>
        <Show when={props.command}>
          <span class="min-w-0 truncate font-mono text-xs font-medium text-neutral-950">
            {props.command}
          </span>
          <span class="text-caption text-neutral-500" aria-hidden="true">·</span>
        </Show>
        <span class="shrink-0 text-caption text-neutral-500">{props.agentLabel}</span>
        <Show when={props.derecha}>
          <span class="ml-auto flex shrink-0 items-center">{props.derecha}</span>
        </Show>
      </header>
      <Show when={props.children}>
        <div class="max-h-72 overflow-y-auto p-3">{props.children}</div>
      </Show>
    </article>
  );
}

function Salida(props: { text: string }) {
  return (
    <Show
      when={esMarkdown(props.text)}
      fallback={
        <pre class="m-0 overflow-x-auto font-mono text-xs leading-[1.5] whitespace-pre-wrap text-neutral-950">
          {props.text}
        </pre>
      }
    >
      <Markdown>{props.text}</Markdown>
    </Show>
  );
}
