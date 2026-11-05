import Check from "lucide-solid/icons/check";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Copy from "lucide-solid/icons/copy";
import ExternalLink from "lucide-solid/icons/external-link";
import { Spinner } from "../../ui/Spinner";
import { Show, createSignal, type JSX } from "solid-js";
import { createCopied } from "../../lib/clipboard";
import { enfocar } from "../../lib/focus";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { prosaDe } from "../../ui/Failure";
import { Input } from "../../ui/Input";
import { Terminal, TerminalBody } from "../../ui/Terminal";
import "../../locales/settingsPhrases";

/** Un paso de la conexión: el número, qué hacer, y con qué. */
function Paso(props: { numero: number; titulo: string; children: JSX.Element }) {
  return (
    <section class="flex gap-3">
      <span class="grid size-5 shrink-0 place-items-center rounded-full bg-surface-muted text-caption font-semibold text-neutral-700">
        {props.numero}
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <h3 class="m-0 text-xs font-semibold text-neutral-950">{props.titulo}</h3>
        {props.children}
      </div>
    </section>
  );
}

/**
 * La ventana de una conexión por navegador, la misma de Configuración: el enlace para
 * abrirlo otra vez o copiarlo, el código a confirmar, el código a pegar y lo que dice el CLI.
 * Solo se cierra con «cancelar»: un clic fuera no puede tirar un login con su proceso vivo.
 */
export function DialogoDeConexion(props: {
  etiqueta: string;
  url: string | null;
  porConfirmar: string | null;
  pideCodigo: boolean;
  salida: string[];
  onCancelar: () => void;
  onCodigo: (codigo: string) => void;
}) {
  const [codigo, setCodigo] = createSignal("");
  const [copiaFallida, setCopiaFallida] = createSignal<string | null>(null);
  const { copied: copiado, copy } = createCopied(1400, (e) => setCopiaFallida(prosaDe(e)));
  const enviar = () => {
    if (codigo().trim()) props.onCodigo(codigo().trim());
  };
  async function copiar(u: string) {
    setCopiaFallida(null);
    await copy(u);
  }
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && props.onCancelar()}>
      <DialogContent
        class="flex w-[min(520px,100%)] max-w-[520px] flex-col gap-4 p-5"
        aria-label={t("settings.accounts.connect_agent", { agent: props.etiqueta })}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 flex-col gap-0.5">
            <DialogTitle class="text-sm font-semibold">
              {t("settings.accounts.connect_agent", { agent: props.etiqueta })}
            </DialogTitle>
            {/* Siempre dice qué espera: que abra el navegador, que termines ahí o que pegues su código. */}
            <span class="flex items-center gap-1.5 text-xs text-neutral-500" role="status">
              <Spinner size={12} />
              {props.pideCodigo
                ? t("onboarding.login.waiting_code")
                : props.url || props.porConfirmar
                  ? t("onboarding.login.waiting_browser")
                  : t("onboarding.login.opening_browser")}
            </span>
          </div>
          <Button variant="outline" size="compact" onClick={() => props.onCancelar()}>
            {t("settings.accounts.cancel")}
          </Button>
        </div>

        <Show when={props.porConfirmar}>
          {(c) => (
            <div class="flex flex-col gap-1.5 text-xs text-neutral-500">
              <span>{t("settings.accounts.confirm_code")}</span>
              <strong class="self-start select-all rounded-sm bg-surface-muted px-3 py-2 font-mono text-3xl font-semibold tracking-[0.12em] text-neutral-950">{c()}</strong>
            </div>
          )}
        </Show>

        <Show when={props.url}>
          {(u) => (
            <Paso numero={1} titulo={t("settings.accounts.step_browser")}>
              <p class="m-0 text-xs text-neutral-500">
                {t("settings.accounts.step_browser_hint", { agent: props.etiqueta })}
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => invoke("open_external", { target: u() }).catch(() => {})}>
                  <ExternalLink size={14} />
                  {t("settings.accounts.open_browser")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void copiar(u())}>
                  <Show when={copiado()} fallback={<Copy size={14} />}>
                    <Check size={14} />
                  </Show>
                  {copiado() ? t("settings.accounts.link_copied") : t("settings.accounts.copy_link")}
                </Button>
              </div>
              <Show when={copiaFallida()}>{(m) => <p class="m-0 text-xs text-error-strong">{m()}</p>}</Show>
            </Paso>
          )}
        </Show>

        <Show when={props.pideCodigo}>
          <Paso numero={props.url ? 2 : 1} titulo={t("settings.accounts.step_code")}>
            <div class="flex items-center gap-2">
              <Input
                class="min-w-0 flex-1 font-mono text-xs"
                type="text"
                ref={enfocar}
                value={codigo()}
                placeholder={t("settings.accounts.code_placeholder")}
                onInput={(e) => setCodigo(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && enviar()}
              />
              <Button disabled={!codigo().trim()} onClick={enviar}>
                {t("settings.accounts.send_code")}
              </Button>
            </div>
          </Paso>
        </Show>

        <Show when={props.salida.length > 0}>
          <details class="group">
            <summary class="flex cursor-pointer list-none items-center gap-1 text-xs text-neutral-500 marker:content-none hover:text-neutral-950">
              <ChevronRight size={12} class="transition-transform group-open:rotate-90" />
              {t("settings.accounts.log", { agent: props.etiqueta })}
            </summary>
            <Terminal class="mt-2">
              <TerminalBody class="max-h-[140px] break-all">{props.salida.join("\n")}</TerminalBody>
            </Terminal>
          </details>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
