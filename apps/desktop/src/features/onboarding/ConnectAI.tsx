import Check from "lucide-solid/icons/check";
import CircleCheck from "lucide-solid/icons/circle-check";
import Circle from "lucide-solid/icons/circle";
import ExternalLink from "lucide-solid/icons/external-link";
import Monitor from "lucide-solid/icons/monitor";
import Sparkles from "lucide-solid/icons/sparkles";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { createSignal, For, lazy, Match, Show, Suspense, Switch, type JSX } from "solid-js";
import { lista } from "../../lib/format";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { RemoveButton } from "../../ui/IconAction";
import { Input } from "../../ui/Input";
import { MarcaAgente } from "../../ui/icons";
import { TerminusMark } from "../../ui/toolMarks";
import { Spinner } from "../../ui/Spinner";
import { DialogoDeConexion } from "../settings/LoginDialog";
import { AvanceDeDescarga, BarraDeCarga, CodigoParaConfirmar, Peso } from "./DownloadProgress";
import { AL_FINAL, type Conexiones, type Fila, nombreDeFila, ordenDelMapa, type Paso } from "./connect-store";

// El panel de modelos locales solo hace falta al abrirlo.
const ListaDeModelosLocales = lazy(() => import("../settings/LocalModels"));

type Nodo = "off" | "det" | "vivo" | "on";

function nodo(p: Paso | undefined): Nodo {
  if (p?.k === "conectada") return "on";
  if (p && ["descargando", "entrando", "clave", "comprobando", "saliendo", "alta"].includes(p.k)) return "vivo";
  return p?.k === "instalada" || p?.k === "sesion" ? "det" : "off";
}

function nombreCorto(f: Fila) {
  if (f.modo === "local") return t("onboarding.ai.local.short");
  if (f.modo === "consentimiento") return t("surfaces.label.free_short");
  if (f.agente === "antigravity") return "Gemini";
  return nombreDeFila(f);
}

function MarcaDeFila(props: { f: Fila; size: number }) {
  if (props.f.modo === "consentimiento") return <Sparkles size={props.size} />;
  if (props.f.modo === "local") return <Monitor size={props.size} />;
  return <MarcaAgente id={props.f.agente} size={props.size} />;
}

const LINEA: Record<Nodo, string> = {
  off: "stroke-border-strong [stroke-dasharray:3_5]",
  det: "stroke-primary/45 [stroke-dasharray:3_5]",
  vivo: "stroke-primary [stroke-dasharray:6_6] animate-flujo motion-reduce:animate-none",
  on: "stroke-primary [stroke-width:2]",
};
const AZULEJO: Record<Nodo, string> = {
  off: "opacity-35 grayscale",
  det: "ring-1 ring-primary/45",
  vivo: "ring-2 ring-primary",
  on: "ring-2 ring-success-strong",
};

/** El texto con los nombres en negrita, como los escribe el resumen del mapa. */
function ConNombres(props: { texto: string; nombres: string }) {
  const i = () => (props.nombres ? props.texto.indexOf(props.nombres) : -1);
  return (
    <Show when={i() >= 0} fallback={props.texto}>
      {props.texto.slice(0, i())}
      <b class="font-semibold text-neutral-950">{props.nombres}</b>
      {props.texto.slice(i() + props.nombres.length)}
    </Show>
  );
}

/** Terminus al centro y cada IA alrededor, con su estado en el trazo y en el aro de su logo. */
export function MapaDeConexiones(props: { c: Conexiones }) {
  const filas = () => ordenDelMapa(props.c.filas());
  const lugar = (i: number) => {
    const angulo = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, filas().length);
    return [50 + 37 * Math.cos(angulo), 48 + 40 * Math.sin(angulo)] as const;
  };
  const resumen = () => {
    const vivo = filas().find((f) => nodo(props.c.pasos[f.id]) === "vivo");
    if (vivo) {
      const names = nombreDeFila(vivo);
      return { texto: t("onboarding.ai.map.connecting", { name: names }), names };
    }
    const on = props.c.conectadas();
    if (on.length) {
      const names = lista(on.map(nombreDeFila));
      return { texto: t("onboarding.ai.map.ready", { count: on.length, names }), names };
    }
    const det = filas().filter((f) => f.detectada);
    if (det.length) {
      const names = lista(det.map(nombreDeFila));
      return { texto: t("onboarding.ai.map.found", { names }), names };
    }
    return { texto: t("onboarding.ai.map.none"), names: "" };
  };
  return (
    <div>
      <div class="relative mt-[22px] mb-[18px] h-[250px]" aria-hidden="true">
        <svg class="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
          <For each={filas()}>
            {(f, i) => (
              <line
                x1="50"
                y1="50"
                x2={lugar(i())[0]}
                y2={lugar(i())[1]}
                vector-effect="non-scaling-stroke"
                class={cn("[stroke-width:1.5] transition-[stroke] duration-300", LINEA[nodo(props.c.pasos[f.id])])}
              />
            )}
          </For>
        </svg>
        <span class="absolute top-1/2 left-1/2 grid size-[58px] -translate-1/2 place-items-center rounded-2xl bg-primary text-[var(--action-text)] shadow-lg ring-6 ring-bg">
          <TerminusMark size={30} />
        </span>
        <For each={filas()}>
          {(f, i) => {
            const estado = () => nodo(props.c.pasos[f.id]);
            return (
              <span
                class={cn(
                  "absolute grid w-[92px] -translate-1/2 justify-items-center gap-[5px] text-center text-caption transition-opacity duration-300",
                  estado() === "on" ? "font-semibold text-neutral-950" : "text-neutral-500",
                  estado() === "off" && "opacity-80",
                )}
                style={{ left: `${lugar(i())[0]}%`, top: `${lugar(i())[1]}%` }}
              >
                <span
                  class={cn(
                    "relative grid size-10 place-items-center rounded-[11px] border border-border bg-surface-raised ring-offset-4 ring-offset-bg transition-[filter,opacity,box-shadow] duration-300",
                    AZULEJO[estado()],
                  )}
                >
                  <MarcaDeFila f={f} size={22} />
                  <Show when={estado() === "on"}>
                    <span class="absolute -top-1 -right-1.5 grid size-4 place-items-center rounded-full bg-success-strong text-bg ring-2 ring-bg">
                      <Check size={10} stroke-width={3} />
                    </span>
                  </Show>
                </span>
                <span class="truncate">{nombreCorto(f)}</span>
              </span>
            );
          }}
        </For>
      </div>
      <p class="m-0 min-h-[18px] text-center text-ui text-neutral-500" role="status">
        <ConNombres texto={resumen().texto} nombres={resumen().names} />
      </p>
    </div>
  );
}

/** Lo hecho y lo que falta del alta, debajo del mapa y en el resumen de «Personaliza». */
export function Comprobacion(props: { filas: { hecho: boolean; texto: string; enCurso?: boolean }[]; compacta?: boolean }) {
  return (
    <ul class={cn("m-0 grid list-none p-0", props.compacta ? "gap-2 text-ui" : "gap-2.5 text-sm")}>
      <For each={props.filas}>
        {(f) => (
          <li class={cn("flex items-center", props.compacta ? "gap-2" : "gap-2.5", f.hecho ? "text-success-strong" : "text-neutral-500")}>
            <Switch fallback={<Circle size={16} aria-hidden="true" />}>
              <Match when={f.hecho}>
                <CircleCheck size={16} aria-hidden="true" />
              </Match>
              <Match when={f.enCurso}>
                <Spinner class="text-primary" />
              </Match>
            </Switch>
            <span class="min-w-0 truncate">{f.texto}</span>
          </li>
        )}
      </For>
    </ul>
  );
}


function detalle(c: Conexiones, f: Fila): string {
  const p = c.pasos[f.id];
  const base =
    f.modo === "consentimiento"
      ? t("settings.ai_providers.free_detail")
      : f.modo === "local"
        ? t("onboarding.ai.local.detail")
        : f.agente.startsWith("opencode")
          ? t("onboarding.ai.opencode_detail")
          : "";
  switch (p?.k) {
    case "externa":
      return t("onboarding.ai.external_waiting");
    case "sesion":
      return t("onboarding.ai.has_session", { account: p.identidad });
    case "instalada":
      if (f.modo === "consentimiento" || f.modo === "local") return base;
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
      if (base) return base;
      return c.externa(f) ? t("onboarding.ai.external_detail") : t("onboarding.ai.installs_and_signs_in");
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
          <span class="truncate text-xs text-neutral-500" title={detalle(props.c, props.f)}>
            {detalle(props.c, props.f)}
          </span>
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
              <Show when={props.f.modo === "local"}>
                <Button size="compact" variant="ghost" onClick={() => props.c.alternarLocal(props.f.id)}>
                  {t("onboarding.ai.local.models")}
                </Button>
              </Show>
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
                <button
                  type="button"
                  class="inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-primary hover:underline"
                  onClick={() => void invoke("open_external", { target: url() }).catch(() => {})}
                >
                  {url().replace(/^https?:\/\//, "")}
                  <ExternalLink size={11} aria-hidden="true" />
                </button>
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

/** El catálogo de modelos locales, abierto debajo de su tarjeta como el panel de la clave. */
function PanelLocal(props: { c: Conexiones }) {
  const m = props.c.locales;
  return (
    <div class={PANEL}>
      <strong class="text-ui font-semibold">{t("onboarding.ai.local.title")}</strong>
      <Suspense fallback={<Spinner class="justify-self-center text-neutral-500" />}>
        <ListaDeModelosLocales m={m} />
      </Suspense>
      <div class="mt-0.5 flex flex-wrap items-center gap-2">
        <span class="min-w-0 flex-1 text-xs text-neutral-500">{t("onboarding.ai.local.hint")}</span>
        <Button size="sm" variant={m.listo() ? "primary" : "ghost"} onClick={() => props.c.cerrarLocal()}>
          {m.listo() ? t("onboarding.ai.local.done") : t("onboarding.cancel")}
        </Button>
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

function FilaDeIA(props: { c: Conexiones; f: Fila }) {
  const p = () => props.c.pasos[props.f.id];
  const abajo = () => {
    const paso = p();
    if (paso?.k === "clave" || (paso?.k === "comprobando" && props.f.modo === "clave"))
      return <PanelDeClave c={props.c} f={props.f} />;
    if (paso?.k === "alta") return <PanelDeAlta c={props.c} f={props.f} paso={paso} />;
    const error = props.c.errores[props.f.id];
    if (error) return <ErrorDeTarjeta texto={error} />;
    if (props.f.modo === "local" && props.c.localAbierto() === props.f.id) return <PanelLocal c={props.c} />;
    if (props.f.modo === "consentimiento" && (paso?.k === "falta" || paso?.k === "instalada")) return <AvisoDeGratuitos />;
    return undefined;
  };
  const resaltada = () =>
    (["sesion", "entrando", "clave", "comprobando", "alta"].includes(p()?.k ?? "") && props.f.modo !== "consentimiento") ||
    props.c.localAbierto() === props.f.id;
  return <Tarjeta c={props.c} f={props.f} abajo={abajo()} resaltada={resaltada()} />;
}

/** El panel de la derecha: lo encontrado en esta computadora primero, luego los demás proveedores y ZCode al final. */
export function PanelDeIA(props: { c: Conexiones }) {
  const encontrada = (f: Fila) => f.detectada && f.agente !== AL_FINAL;
  const detectadas = () => props.c.filas().filter(encontrada);
  const otras = () => props.c.filas().filter((f) => !encontrada(f));
  return (
    <div class="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto rounded-lg border border-border bg-surface-raised p-5 [&>*]:shrink-0">
      <Show
        when={detectadas().length > 0}
        fallback={<h2 class="m-0 text-xs font-semibold text-neutral-500">{t("onboarding.ai.choose")}</h2>}
      >
        <h2 class="m-0 flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Sparkles size={13} aria-hidden="true" />
          {t("onboarding.ai.found")}
        </h2>
        <For each={detectadas()}>{(f) => <FilaDeIA c={props.c} f={f} />}</For>
        <h2 class="m-0 mt-1.5 text-xs font-semibold text-neutral-500">{t("onboarding.ai.others")}</h2>
      </Show>
      <For each={otras()}>{(f) => <FilaDeIA c={props.c} f={f} />}</For>
      <Show when={!props.c.cargada() && !props.c.falloDeCarga()}>
        <div class="grid h-[62px] place-items-center text-neutral-500">
          <Spinner />
        </div>
      </Show>
      <Show when={props.c.falloDeCarga()}>
        {(e) => <p class="m-0 text-xs text-error-strong">{e()}</p>}
      </Show>
      <Show when={props.c.filas().find((f) => props.c.pasos[f.id]?.k === "entrando")}>
        {(f) => {
          const p = () => props.c.pasos[f().id];
          const de = <K extends "url" | "codigo">(k: K) => {
            const x = p();
            return x?.k === "entrando" ? (x[k] ?? null) : null;
          };
          return (
            <DialogoDeConexion
              etiqueta={nombreDeFila(f())}
              url={de("url")}
              porConfirmar={de("codigo")}
              pideCodigo={p()?.k === "entrando" && Boolean((p() as { pideCodigo?: boolean }).pideCodigo)}
              salida={props.c.salidas[f().id] ?? []}
              onCancelar={() => void props.c.cancelar(f().id)}
              onCodigo={(codigo) => void props.c.enviarCodigo(f().id, codigo)}
            />
          );
        }}
      </Show>
    </div>
  );
}
