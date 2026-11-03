import { listen } from "../../lib/serviceEvents";
import { createEffect, For, type JSX, Match, onCleanup, onMount, Show, Switch, createSignal } from "solid-js";
import { markConnected } from "../../lib/engineConnection";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { cn } from "../../lib/utils";
import {
  createFullscreen,
  HEADER_HEIGHT,
  isWindows,
  needsTrafficLightPadding,
  TRAFFIC_LIGHT_PADDING,
  toggleMaximizeFromHeader,
} from "../../lib/window";
import { Button } from "../../ui/Button";
import { Toast, ToastPortal } from "../../ui/Toast";
import ControlesDeVentana from "./WindowControls";

/**
 * Lo que la ventana enseña antes de tener motor: el traspaso desde 0.2.74, el
 * aviso mientras la versión anterior termina sus turnos (o «Detener y entrar ya») y la salida si el motor no arranca. Rust decide la fase (`launcher.rs`). Mientras
 * conecta o espera se monta la app: lo que pide al motor espera (`lib/invoke.ts`).
 */

type Paso = "pending" | "active" | "done";
type Traspaso = {
  phase: "handoff";
  reason: "first" | "readopt";
  started: boolean;
  window: Paso;
  work: Paso;
  tasks: number | null;
  git: Paso;
  engine: Paso;
  done: boolean;
};
type Fase =
  | { phase: "connecting" }
  | { phase: "ready"; blank_0274?: boolean }
  | Traspaso
  | { phase: "previous"; tasks: number | null; stopping: boolean }
  | { phase: "failed"; code: string; log: string; data: string };

const RELEASE_0274 = "https://github.com/danil-labs/danil/releases/tag/v0.2.74";
const TEXTOS = {
  first: () => [t("launcher.handoff.first.title"), t("launcher.handoff.first.body")],
  readopt: () => [t("launcher.handoff.readopt.title"), t("launcher.handoff.readopt.body")],
};
const MOTIVOS: Record<string, () => string> = {
  version_mismatch: () => t("launcher.failed.reason.version_mismatch"),
  managed_service_unavailable: () => t("shell.service.managed"),
  managed_profile_invalid: () => t("shell.service.managed"),
  engine_missing: () => t("launcher.failed.reason.engine_missing"),
  invalid_token: () => t("launcher.failed.reason.not_private"),
  service_busy: () => t("launcher.failed.reason.service_busy"),
  authority_incompatible: () => t("launcher.failed.reason.authority_incompatible"),
  adoption_required: () => t("launcher.failed.reason.adoption_required"),
  engine_start_failed: () => t("launcher.failed.reason.engine_start_failed"),
};

export default function Lanzador(props: { children: JSX.Element }) {
  const [fase, setFase] = createSignal<Fase | null>(null);
  const pantallaCompleta = createFullscreen();
  const apartarSemaforo = needsTrafficLightPadding(() => true, pantallaCompleta);

  onMount(() => {
    const escucha = listen<Fase>("launcher", (e) => setFase(e.payload));
    // Sin lanzador que conteste no hay nada que esperar: la ventana abrió con una selección.
    void invoke<Fase>("launcher_state")
      .then((actual) => setFase((visto) => visto ?? actual))
      .catch(() => setFase({ phase: "ready" }));
    onCleanup(() => void escucha.then((f) => f()));
  });
  createEffect(() => {
    if (fase()?.phase === "ready") markConnected();
  });
  // Esperar a la versión anterior no tapa la ventana: es un aviso sobre la app que conecta.
  const montada = () => ["ready", "connecting", "previous"].includes(fase()?.phase ?? "");

  const seguir = () => void invoke("launcher_continue");
  // «Detener y entrar ya» corta turnos: se confirma diciendo cuántos.
  const [confirmando, setConfirmando] = createSignal(false);
  const traspaso = () => {
    const f = fase();
    return f?.phase === "handoff" ? f : null;
  };
  const anterior = () => {
    const f = fase();
    return f?.phase === "previous" ? f : null;
  };
  const fallo = () => {
    const f = fase();
    return f?.phase === "failed" ? f : null;
  };

  const pasos = (h: Traspaso) => [
    {
      estado: h.window,
      texto:
        h.window === "done"
          ? t("launcher.step.window.done")
          : h.window === "active"
            ? t("launcher.step.window.open")
            : t("launcher.step.window.pending"),
      oculto: false,
    },
    {
      estado: h.work,
      texto:
        h.work === "done"
          ? t("launcher.step.work.done")
          : h.tasks
            ? t("launcher.step.work.tasks", { count: h.tasks })
            : t("launcher.step.work.pending"),
      oculto: false,
    },
    {
      estado: h.git,
      texto: h.git === "done" ? t("launcher.step.git.done") : t("launcher.step.git.pending"),
      oculto: h.git === "pending",
    },
    {
      estado: h.engine,
      texto: h.engine === "done" ? t("launcher.step.engine.done") : t("launcher.step.engine.pending"),
      oculto: false,
    },
  ];

  return (
    <Switch>
      <Match when={montada()}>
        {props.children}
        <Show when={fase()?.phase === "ready" && (fase() as { blank_0274?: boolean }).blank_0274}>
          <ToastPortal>
            <Toast tone="status" data-launcher-blank="">
              <p class="m-0 break-words text-xs text-neutral-950">{t("launcher.blank_0274")}</p>
            </Toast>
          </ToastPortal>
        </Show>
        <Show when={anterior()}>
          {(a) => (
            // Fuera de la pila de avisos: sin motor, la app que la monta todavía no pintó.
            <div class="pointer-events-none fixed bottom-4 right-4 z-50 grid justify-items-end gap-2">
              <Toast tone="status" data-launcher-previous="">
                <p class="m-0 break-words text-xs text-neutral-950" aria-live="polite">
                  {a().stopping
                    ? t("launcher.previous.stopping")
                    : a().tasks
                      ? t("launcher.previous.waiting", { count: a().tasks ?? 0 })
                      : t("launcher.previous.waiting_unknown")}
                </p>
                <Show when={!a().stopping}>
                  <Show
                    when={confirmando()}
                    fallback={
                      <>
                        <p class="m-0 break-words text-xs text-neutral-500">{t("launcher.previous.body")}</p>
                        <div class="flex gap-2">
                          <Button size="compact" variant="secondary" onClick={() => setConfirmando(true)}>
                            {t("launcher.previous.stop_now")}
                          </Button>
                        </div>
                      </>
                    }
                  >
                    <p class="m-0 break-words text-xs text-neutral-500">
                      {a().tasks
                        ? t("launcher.previous.confirm", { count: a().tasks ?? 0 })
                        : t("launcher.previous.confirm_unknown")}
                    </p>
                    <div class="flex gap-2">
                      <Button
                        size="compact"
                        onClick={() => {
                          setConfirmando(false);
                          seguir();
                        }}
                      >
                        {t("launcher.previous.stop")}
                      </Button>
                      <Button size="compact" variant="secondary" onClick={() => setConfirmando(false)}>
                        {t("launcher.previous.keep_waiting")}
                      </Button>
                    </div>
                  </Show>
                </Show>
              </Toast>
            </div>
          )}
        </Show>
      </Match>
      <Match when={fase() === null}>
        <div class="h-full bg-bg" />
      </Match>
      <Match when={!montada()}>
        <main class="flex h-full flex-col overflow-hidden bg-bg" data-launcher={fase()?.phase}>
          <Cabecera apartar={apartarSemaforo()} />
          <section class="flex min-h-0 flex-1 flex-col items-start overflow-y-auto px-10 py-10">
            <Show when={traspaso()}>
              {(h) => (
                <>
                  <h1 class="m-0 mb-5 max-w-[22ch] text-3xl leading-tight font-display font-bold tracking-[-0.03em] text-neutral-950">
                    {TEXTOS[h().reason]()[0]}
                  </h1>
                  <p class="m-0 max-w-[60ch] text-sm text-neutral-500">{TEXTOS[h().reason]()[1]}</p>
                  <p class="m-0 mt-3 max-w-[60ch] text-sm text-neutral-500">{t("launcher.handoff.nothing_killed")}</p>
                  <ol class="m-0 mt-8 flex list-none flex-col gap-3 p-0" aria-live="polite">
                    <For each={pasos(h()).filter((p) => !p.oculto)}>
                      {(paso) => (
                        <li class="flex items-center gap-3 text-sm" data-step={paso.estado}>
                          <span
                            aria-hidden="true"
                            class={cn(
                              "size-2.5 shrink-0 rounded-full",
                              paso.estado === "done" && "bg-success",
                              paso.estado === "active" && "bg-primary",
                              paso.estado === "pending" && "bg-neutral-300",
                            )}
                          />
                          <span class={paso.estado === "pending" ? "text-neutral-500" : "text-neutral-950"}>
                            {paso.texto}
                          </span>
                        </li>
                      )}
                    </For>
                  </ol>
                  <div class="mt-8 flex gap-2">
                    <Show when={!h().started}>
                      <Button size="sm" onClick={seguir}>
                        {t("launcher.handoff.start")}
                      </Button>
                    </Show>
                    <Show when={h().done}>
                      <p class="m-0 self-center text-sm text-neutral-950">{t("launcher.handoff.done")}</p>
                      <Button size="sm" onClick={seguir}>
                        {t("launcher.handoff.open")}
                      </Button>
                    </Show>
                  </div>
                </>
              )}
            </Show>
            <Show when={fallo()}>
              {(f) => (
                <>
                  <h1 class="m-0 mb-5 max-w-[22ch] text-3xl leading-tight font-display font-bold tracking-[-0.03em] text-neutral-950">
                    {f().code === "version_mismatch" ? t("launcher.failed.incompatible.title") : t("launcher.failed.title")}
                  </h1>
                  <p class="m-0 max-w-[60ch] text-sm text-neutral-950">
                    {(MOTIVOS[f().code] ?? (() => t("launcher.failed.reason.other")))()}
                  </p>
                  <p class="m-0 mt-4 max-w-[60ch] text-sm text-neutral-500">{t("launcher.failed.log")}</p>
                  <code class="mt-1 block max-w-full text-xs break-all text-neutral-950 select-text">{f().log}</code>
                  <p class="m-0 mt-1 text-xs text-neutral-500">{t("launcher.failed.code", { code: f().code })}</p>
                  <p class="m-0 mt-6 max-w-[60ch] text-sm text-neutral-500">
                    {t("launcher.failed.back", { url: RELEASE_0274 })}
                  </p>
                  <code class="mt-1 block max-w-full text-xs break-all text-neutral-950 select-text">{f().data}</code>
                  <div class="mt-8">
                    <Button size="sm" variant="secondary" onClick={seguir}>
                      {t("launcher.failed.retry")}
                    </Button>
                  </div>
                </>
              )}
            </Show>
          </section>
        </main>
      </Match>
    </Switch>
  );
}

function Cabecera(props: { apartar: boolean }) {
  return (
    <header
      class={cn("flex shrink-0 items-center border-b border-border px-7 text-xs", HEADER_HEIGHT, props.apartar && TRAFFIC_LIGHT_PADDING)}
      data-tauri-drag-region=""
      onDblClick={toggleMaximizeFromHeader}
    >
      <span class="flex-1 self-stretch" data-tauri-drag-region="" />
      <Show when={isWindows()}>
        <ControlesDeVentana />
      </Show>
    </header>
  );
}
