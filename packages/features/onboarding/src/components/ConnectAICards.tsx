import ExternalLink from "lucide-solid/icons/external-link";
import Check from "lucide-solid/icons/check";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { createSignal, Match, Show, Switch, type JSX } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { cn } from "../../../../ui/src/lib/utils";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { RemoveButton } from "../../../../ui/src/IconAction";
import { Input } from "../../../../ui/src/Input";
import { Pressable } from "../../../../ui/src/Pressable";
import { Spinner } from "../../../../ui/src/Spinner";
import { AvanceDeDescarga, BarraDeCarga, CodigoParaConfirmar, Peso } from "./DownloadProgress";
import { MarcaDeFila } from "./ConnectAIMap";
import { type Conexiones, type Fila, nombreDeFila, openExternal, type Paso } from "../queries/connect-store";

function detalle(c: Conexiones, f: Fila): string {
  const p = c.pasos[f.id];
  switch (p?.k) {
    case "externa":
      return t("onboarding.ai.external_waiting");
    case "sesion":
      return t("onboarding.ai.has_session", { account: p.identidad });
    case "instalada":
      if (f.modo === "consentimiento") return "";
      return t("onboarding.ai.system_no_session");
    case "descargando":
      return t("onboarding.ai.downloading");
    case "entrando":
      if (p.codigo) return t("onboarding.login.confirm_in_browser");
      return p.pideCodigo ? t("onboarding.ai.paste_code") : t("onboarding.ai.finish_in_browser");
    case "clave":
      return t("onboarding.ai.paste_key");
    case "comprobando":
      return f.modo === "clave" ? t("onboarding.ai.checking_key") : t("onboarding.ai.preparing");
    case "conectada":
      return p.cuenta;
    case "saliendo":
      return t("onboarding.ai.disconnecting");
    case "alta":
      return t("onboarding.ai.signup.pending");
    default:
      return "";
  }
}

/** Una tarjeta de tamaño fijo: logo, nombre en una línea, detalle y una columna de acciones de ancho fijo. */
function Tarjeta(props: { c: Conexiones; f: Fila; abajo?: JSX.Element; resaltada?: boolean }) {
  const p = () => props.c.pasos[props.f.id];
  const nombre = () => nombreDeFila(props.f);
  const gratuitos = () => props.f.modo === "consentimiento";
  const fallo = () => Boolean(props.c.errores[props.f.id]);
  return (
    <div class={cn("grid shrink-0", fallo() && "animate-sacudir")}>
      <div
        class={cn(
          "relative flex h-[62px] items-center gap-3 overflow-hidden rounded-md border px-3.5 py-2 transition-colors duration-300",
          fallo()
            ? "border-error-strong bg-error/5"
            : p()?.k === "conectada"
              ? "border-success-strong/40 bg-success/5"
              : props.resaltada
                ? "border-primary bg-primary/5"
                : "border-border bg-surface-raised",
          props.abajo && "rounded-b-none",
        )}
      >
        <span class="grid size-6 shrink-0 place-items-center">
          <MarcaDeFila f={props.f} size={20} />
        </span>
        <span class="grid min-w-0 flex-1 gap-0.5">
          <strong class="truncate text-sm font-semibold text-neutral-950">{nombre()}</strong>
          <Show when={detalle(props.c, props.f)}>
            {(estado) => <span class="truncate text-xs text-neutral-500" title={estado()}>{estado()}</span>}
          </Show>
        </span>
        <span class="flex w-[196px] shrink-0 items-center justify-end gap-1.5">
          <Switch
            fallback={
              <>
                <Show when={fallo()}>
                  <TriangleAlert size={16} class="shrink-0 text-error-strong" aria-hidden="true" />
                </Show>
                <Show when={!fallo() && (!p() || p()?.k === "falta")}>
                  <Peso bytes={props.f.bytes} />
                </Show>
                <Button size="sm" variant="secondary" onClick={() => void props.c.conectar(props.f.id)}>
                  {fallo() ? t("onboarding.ai.retry") : gratuitos() ? t("onboarding.ai.activate") : t("onboarding.ai.connect")}
                </Button>
              </>
            }
          >
            <Match when={p()?.k === "descargando" && (p() as { hecho: number; total: number })}>
              {(d) => (
                <AvanceDeDescarga
                  total={d().total}
                  cancelar={t("onboarding.ai.cancel_download", { name: nombre() })}
                  onCancelar={() => props.c.cancelarDescarga(props.f.id)}
                />
              )}
            </Match>
            <Match when={p()?.k === "sesion"}>
              <Button size="sm" variant="ghost" onClick={() => void props.c.conectar(props.f.id)}>
                {t("onboarding.ai.connect_other")}
              </Button>
              <Button size="sm" onClick={() => void props.c.usarSesion(props.f.id)}>
                {t("onboarding.ai.use_this")}
              </Button>
            </Match>
            <Match when={p()?.k === "entrando"}>
              <Show when={(p() as { codigo?: string }).codigo} fallback={<Spinner class="text-primary" />}>
                {(c) => <CodigoParaConfirmar codigo={c()} />}
              </Show>
              <Button size="sm" variant="ghost" onClick={() => void props.c.cancelar(props.f.id)}>
                {t("onboarding.cancel")}
              </Button>
            </Match>
            <Match when={p()?.k === "clave"}>
              <Button size="sm" variant="ghost" onClick={() => void props.c.cancelar(props.f.id)}>
                {t("onboarding.cancel")}
              </Button>
            </Match>
            <Match when={p()?.k === "alta"}>
              <Show when={(p() as { revisando?: boolean }).revisando}>
                <Spinner class="text-primary" />
              </Show>
              <Button size="sm" variant="ghost" onClick={() => void props.c.cancelar(props.f.id)}>
                {t("onboarding.cancel")}
              </Button>
            </Match>
            <Match when={p()?.k === "comprobando" || p()?.k === "saliendo"}>
              <Spinner class={p()?.k === "saliendo" ? "text-neutral-500" : "text-primary"} />
            </Match>
            <Match when={p()?.k === "conectada"}>
              <Badge tone="success" class="gap-1">
                <Check size={11} stroke-width={3} aria-hidden="true" />
                {gratuitos() ? t("onboarding.ai.activated") : t("onboarding.ai.connected")}
              </Badge>
              <RemoveButton
                icon="unlink"
                label={
                  gratuitos()
                    ? t("onboarding.ai.deactivate", { name: nombre() })
                    : t("onboarding.ai.disconnect", { name: nombre() })
                }
                onClick={() => void props.c.desconectar(props.f.id)}
              />
            </Match>
          </Switch>
        </span>
        <Show when={p()?.k === "descargando" && (p() as { hecho: number; total: number })}>
          {(d) => <BarraDeCarga hecho={d().hecho} total={d().total} />}
        </Show>
      </div>
      {props.abajo}
    </div>
  );
}

const PANEL = "grid gap-2 rounded-b-lg border border-t-0 border-primary bg-surface-raised px-4 py-3.5 motion-safe:animate-entrar";

function PanelDeClave(props: { c: Conexiones; f: Fila }) {
  const [valor, setValor] = createSignal("");
  const ocupado = () => props.c.pasos[props.f.id]?.k === "comprobando";
  const error = () => props.c.errores[props.f.id];
  const id = `clave-${props.f.id}`;
  const enviar = () => {
    if (valor().trim() && !ocupado()) void props.c.guardarClave(props.f.id, valor()).then(() => setValor(""));
  };
  return (
    <div class={PANEL}>
      <label class="text-ui font-semibold" for={id}>
        {t(`onboarding.ai.key.label.${props.f.agente}`)}
      </label>
      <Input
        id={id}
        type="password"
        class={cn("font-mono tracking-[0.02em]", error() && "border-error-strong")}
        autocomplete="off"
        spellcheck={false}
        placeholder={props.f.placeholder}
        value={valor()}
        disabled={ocupado()}
        aria-invalid={error() ? true : undefined}
        ref={(el) => queueMicrotask(() => el.focus())}
        onInput={(e) => {
          setValor(e.currentTarget.value);
          props.c.limpiarError(props.f.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") enviar();
        }}
      />
      <Show
        when={error()}
        fallback={
          <Show when={props.f.urlDeClave}>
            {(url) => (
              <span class="text-xs text-neutral-500">
                {t(`onboarding.ai.key.help.${props.f.agente}`)}{" "}
                <Pressable
                  class="inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-primary hover:underline"
                  onClick={() => void openExternal(url()).catch(() => {})}
                >
                  {url().replace(/^https?:\/\//, "")}
                  <ExternalLink size={11} aria-hidden="true" />
                </Pressable>
              </span>
            )}
          </Show>
        }
      >
        {(e) => (
          <span class="text-xs text-error-strong" role="alert">
            {e()}
          </span>
        )}
      </Show>
      <div class="mt-0.5 flex flex-wrap items-center gap-2">
        <span class="text-xs text-neutral-500">{t("onboarding.ai.key.stored")}</span>
        <span class="flex-1" />
        <Button size="sm" variant="ghost" disabled={ocupado()} onClick={() => void props.c.cancelar(props.f.id)}>
          {t("onboarding.cancel")}
        </Button>
        <Button size="sm" disabled={ocupado() || !valor().trim()} onClick={enviar}>
          {ocupado() ? t("onboarding.ai.checking") : t("onboarding.ai.connect")}
        </Button>
      </div>
    </div>
  );
}

/** La cuenta ya inició sesión y le falta el alta: la página se abrió sola y se vuelve a revisar al regresar. */
function PanelDeAlta(props: { c: Conexiones; f: Fila; paso: Extract<Paso, { k: "alta" }> }) {
  return (
    <div class={PANEL}>
      <span class="text-xs leading-[1.4] text-neutral-700">
        {props.paso.url ? t("onboarding.ai.signup.hint") : t("onboarding.ai.signup.hint_admin")}
      </span>
      <div class="mt-0.5 flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={props.paso.revisando} onClick={() => void props.c.revisarAlta(props.f.id)}>
          {t("onboarding.ai.signup.check")}
        </Button>
        <Show when={props.paso.url}>
          <Button size="sm" onClick={() => props.c.abrirAlta(props.f.id)}>
            {t("onboarding.ai.signup.open")}
            <ExternalLink size={12} aria-hidden="true" />
          </Button>
        </Show>
      </div>
    </div>
  );
}

/** El aviso de los gratuitos va pegado a su tarjeta mientras no se han activado. */
function AvisoDeGratuitos() {
  return (
    <div class="flex items-start gap-2 rounded-b-md border border-t-0 border-border bg-warning/10 px-3.5 py-2 text-caption leading-[1.4] text-warning-strong">
      <TriangleAlert size={13} class="mt-px shrink-0" aria-hidden="true" />
      <span>
        <b class="font-semibold">{t("onboarding.ai.free.warning_lead")}</b> {t("onboarding.ai.free.warning_rest")}
      </span>
    </div>
  );
}

/** Lo que falló, entero y legible debajo de su tarjeta: el detalle de la tarjeta es de una sola línea. */
export function ErrorDeTarjeta(props: { texto: string; class?: string }) {
  return (
    <div
      class={cn(
        "flex items-start gap-2 rounded-b-md border border-t-0 border-border bg-error/10 px-3.5 py-2 text-xs leading-[1.4] break-words text-error-strong",
        props.class,
      )}
      role="alert"
    >
      <TriangleAlert size={13} class="mt-px shrink-0" aria-hidden="true" />
      <span class="min-w-0">{props.texto}</span>
    </div>
  );
}

export function FilaDeIA(props: { c: Conexiones; f: Fila }) {
  const p = () => props.c.pasos[props.f.id];
  const abajo = () => {
    const paso = p();
    if (paso?.k === "clave" || (paso?.k === "comprobando" && props.f.modo === "clave"))
      return <PanelDeClave c={props.c} f={props.f} />;
    if (paso?.k === "alta") return <PanelDeAlta c={props.c} f={props.f} paso={paso} />;
    const error = props.c.errores[props.f.id];
    if (error) return <ErrorDeTarjeta texto={error} />;
    if (props.f.modo === "consentimiento" && (paso?.k === "falta" || paso?.k === "instalada")) return <AvisoDeGratuitos />;
    return undefined;
  };
  const resaltada = () =>
    ["sesion", "entrando", "clave", "comprobando", "alta"].includes(p()?.k ?? "") && props.f.modo !== "consentimiento";
  return <Tarjeta c={props.c} f={props.f} abajo={abajo()} resaltada={resaltada()} />;
}
