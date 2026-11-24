import {
  createEffect,
  createSignal,
  For,
  getOwner,
  lazy,
  Match,
  onCleanup,
  runWithOwner,
  Show,
  Suspense,
  Switch,
} from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { capabilities } from "../../../../host/src/platform";
import { cn } from "../../../../ui/src/lib/utils";
import { Button } from "../../../../ui/src/Button";
import { Pressable } from "../../../../ui/src/Pressable";
import { asFailure, FailureNote, prosaDe } from "../../../../ui/src/Failure";
import { Toast, ToastPortal } from "../../../../ui/src/Toast";
import type { Conexiones } from "../queries/connect-store";
import { offerAccountWelcome } from "../model/account-welcome";
import { entrarAlWorkspaceFree } from "../queries/onboarding-store";
import { CabeceraDelAlta } from "../components/Phases";
import { Escenario, QUIETO, TituloCambiante } from "../components/Stage";
import { Esqueleto, TarjetaVacia } from "./SetupSkeleton";
import { crearCorridaDelAlta, type SetupProps } from "./setup-run";
import { crearEstadoDelAlta } from "./setup-state";

export type { SetupProps } from "./setup-run";

/**
 * La preparación del runtime, por etapas y a la vista, y en la primera vez el
 * alta entera: preparar, conectar la IA en la misma pantalla y personalizar.
 * Lo que falte con la app abierta se repara detrás con un aviso.
 */

const RITMO_CONSEJOS = 5000;

// Conectar la IA y personalizar solo se cargan en el primer arranque: la carga inicial está en su techo.
const MapaDeConexiones = lazy(() => import("../components/ConnectAI").then((m) => ({ default: m.MapaDeConexiones })));
const PanelDeIA = lazy(() => import("../components/ConnectAI").then((m) => ({ default: m.PanelDeIA })));
const Comprobacion = lazy(() => import("../components/ConnectAI").then((m) => ({ default: m.Comprobacion })));
const Personalizar = lazy(() => import("./Personalize"));
const PreparationProgress = lazy(() => import("../components/Prepare").then((m) => ({ default: m.PreparationProgress })));
const FuncionesAfectadas = lazy(() => import("../components/Repair").then((m) => ({ default: m.FuncionesAfectadas })));
const ConectarCuenta = lazy(() => import("./ConnectAccount"));

export default function Setup(props: SetupProps) {
  // En el navegador no hay instalador: cada máquina de la cuenta llega preparada y la app abre sin esperarla.
  if (!capabilities().localSetup) return props.children;
  const estado = crearEstadoDelAlta();
  const {
    mostrar, seguir, setSeguir, hayEspacio, fallo, setFallo, falloDelServicio, corriendo, reparando,
    falloDeReparar, consejo, setConsejo, sinSoporte, sinEspacio, paso, setPaso, entrando, setEntrando,
    workspace, setWorkspace, cuentaRespondida, setCuentaRespondida, conFoto,
  } = estado;
  const {
    empezar, terminado, fin, falloEsencial, fallas, conFallas, nombreAReparar, claveDelAviso, setDescartado,
    aviso, instalacion, reparar,
  } = crearCorridaDelAlta(props, estado);

  const [conexiones, setConexiones] = createSignal<Conexiones | null>(null);
  const dueño = getOwner();

  const consejos = () => [
    [t("setup.tips.agents.title"), t("setup.tips.agents.body")],
    [t("setup.tips.context.title"), t("setup.tips.context.body")],
    [t("setup.tips.workspaces.title"), t("setup.tips.workspaces.body")],
    [t("setup.tips.memory.title"), t("setup.tips.memory.body")],
  ];

  const temporizador = setInterval(() => {
    if (!QUIETO() && !seguir() && paso() === "preparar") setConsejo((c) => (c + 1) % consejos().length);
  }, RITMO_CONSEJOS);
  onCleanup(() => clearInterval(temporizador));

  /**
   * Aquí se entra al workspace de la organización personal Free, de quien
   * cuelgan las cuentas de la IA, y se cargan los proveedores. Nunca nace uno
   * local (plan de cuentas F1.2).
   */
  let preparadas: Promise<void> | null = null;
  function prepararConexiones() {
    preparadas ??= (async () => {
      if (!workspace()) setWorkspace(await entrarAlWorkspaceFree(props.sealFirstFreeWorkspace));
      if (!workspace()) return;
      if (!conexiones()) {
        const [{ crearConexiones }] = await Promise.all([import("../queries/connect-store"), import("../components/ConnectAI")]);
        runWithOwner(dueño, () => setConexiones(crearConexiones()));
      }
      await conexiones()?.cargar();
    })().catch((e) => {
      preparadas = null;
      throw e;
    });
    return preparadas;
  }

  /** «Siguiente». */
  async function aConectar() {
    if (entrando()) return;
    setEntrando(true);
    setFallo(null);
    try {
      await prepararConexiones();
      if (workspace()) setPaso("ia");
      else setSeguir(true);
    } catch (e) {
      // Sin sesión no hay workspace: la única reacción es volver a la pantalla de inicio de sesión.
      if ((e as { detail?: unknown } | null)?.detail === "no_session") setCuentaRespondida(false);
      else setFallo(prosaDe(e));
    } finally {
      setEntrando(false);
    }
  }

  const alta = () => hayEspacio() === false;
  /** «Conecta tu cuenta de Danil» va antes que todo el alta, y solo una vez por computadora. */
  const pideCuenta = () => offerAccountWelcome(alta(), cuentaRespondida());

  createEffect(() => {
    if (paso() === "preparar" && fin() && alta() && !pideCuenta() && !falloEsencial() && !sinSoporte() && !conFallas() && !fallo() && !falloDelServicio()) {
      void aConectar();
    }
  });
  const ia = () => paso() === "ia";
  const conectadas = () => conexiones()?.conectadas() ?? [];
  const nombres = () => conectadas().map((f) => conexiones()?.nombre(f) ?? f.label);

  const titulo = () => {
    if (ia()) return t("onboarding.ai.title");
    if (terminado() && !falloEsencial() && !conFallas()) return t("setup.done_title");
    return t("setup.title");
  };
  const izquierda = () => (
    <>
      <TituloCambiante titulo={titulo()} />
      <Show when={fallo() ?? falloDelServicio()}>
        {(f) => (
          <div class="mt-6 w-full">
            <FailureNote f={asFailure(f())} />
          </div>
        )}
      </Show>
      <Show when={!ia() && !corriendo() && conFallas()}>
        <div class="mt-6 w-full">
          <Suspense>
          <FuncionesAfectadas
            fallas={fallas()}
            reparando={reparando()}
            error={falloDeReparar()}
            onReparar={() => void reparar()}
            onReiniciar={() => void props.restartApp()}
          />
          </Suspense>
        </div>
      </Show>
      <Show when={!ia() && !corriendo() && sinEspacio()}>
        {(texto) => (
          <div class="mt-6 w-full">
            <FailureNote f={{ what: texto(), detail: "" }} />
          </div>
        )}
      </Show>
      {/* En «Conecta tu IA» el mapa va al centro del alto libre y la comprobación queda abajo. */}
      <div class={cn("w-full", ia() ? "flex min-h-0 flex-1 flex-col" : "mt-auto")}>
        <Show
          when={ia()}
          fallback={
            <div class="border-t border-border pt-5">
              <p class="m-0 text-xs text-neutral-500">{t("setup.tips.eyebrow")}</p>
              <h2 class="m-0 mt-2 mb-1.5 text-base font-display font-bold tracking-[-0.01em] text-neutral-950">
                {consejos()[consejo()][0]}
              </h2>
              <p class="m-0 min-h-[58px] max-w-[42ch] text-ui text-neutral-500">{consejos()[consejo()][1]}</p>
              <div class="mt-2.5 flex gap-1.5">
                <For each={consejos()}>
                  {(_, i) => (
                    <Pressable
                      class={cn(
                        "size-[9px] cursor-pointer rounded-full outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                        i() === consejo() ? "bg-primary" : "bg-border-strong",
                      )}
                      aria-label={t("setup.tips.go", { number: i() + 1 })}
                      aria-pressed={i() === consejo()}
                      onClick={() => setConsejo(i())}
                    />
                  )}
                </For>
              </div>
            </div>
          }
        >
          <Suspense>
          <div class="flex flex-1 flex-col justify-center">
            <Show when={conexiones()}>{(c) => <MapaDeConexiones c={c()} />}</Show>
          </div>
          <div class="mt-4 border-t border-border pt-4">
            <Comprobacion
              filas={[
                { hecho: true, texto: t("onboarding.check.environment") },
                {
                  hecho: conectadas().length > 0,
                  texto: conectadas().length
                    ? t("onboarding.check.ai_connected", {
                        count: conectadas().length,
                        names: nombres().join(", "),
                      })
                    : t("onboarding.check.ai_pending"),
                },
                { hecho: false, texto: t("onboarding.check.personalize") },
              ]}
            />
          </div>
          </Suspense>
        </Show>
      </div>
    </>
  );

  const CAPA =
    "absolute inset-0 flex flex-col gap-2.5 transition-[translate,opacity] duration-[420ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none";

  const derecha = () => (
    <div class="relative min-h-0 flex-1">
      <div class={cn(CAPA, ia() && "pointer-events-none -translate-x-[90px] opacity-0")} inert={ia() || undefined}>
        <Suspense fallback={<TarjetaVacia />}>
        <PreparationProgress i={instalacion()} />
        </Suspense>
      </div>
      <Show when={alta()}>
        <div class={cn(CAPA, !ia() && "pointer-events-none translate-x-[70px] opacity-0")} inert={!ia() || undefined}>
          <Suspense>
            <Show when={conexiones()}>{(c) => <PanelDeIA c={c()} />}</Show>
          </Suspense>
        </div>
      </Show>
    </div>
  );

  const pie = () => (
    <footer class="flex flex-wrap items-center gap-2.5 border-t border-border px-5 py-3.5">
      <Show
        when={ia()}
        fallback={
          <>
            <p class="m-0 text-xs text-neutral-500">{t("setup.footer")}</p>
            <span class="flex-1" />
            {/* Lo incluido se repara con «Reparar»; esto reintenta cuando no hay nada que reparar. */}
            <Show when={!sinSoporte() && (falloDelServicio() || (!corriendo() && !conFallas() && (fallo() || falloEsencial())))}>
              <Button size="sm" variant="secondary" onClick={() => void empezar()}>
                {t("setup.retry")}
              </Button>
            </Show>
            <Show when={!falloEsencial() && !sinSoporte()}>
              <Show when={terminado() && alta() && workspace() && conectadas().length > 0}>
                <Button size="sm" variant="ghost" onClick={() => setPaso("ia")}>
                  {t("setup.back_to_ai")}
                </Button>
              </Show>
              <Button
                size="sm"
                disabled={!terminado() || entrando()}
                onClick={() => (alta() ? void aConectar() : setSeguir(true))}
              >
                {alta() ? t("setup.next.ai") : t("setup.next.app")}
              </Button>
            </Show>
          </>
        }
      >
        <span class="flex-1" />
        <Button size="sm" disabled={conectadas().length === 0} onClick={() => setPaso("personalizar")}>
          {t("onboarding.continue")}
        </Button>
      </Show>
    </footer>
  );

  return (
    <Switch
      fallback={
        <>
          {props.children}
          <Show when={aviso()}>
            <ToastPortal>
              <Toast
                tone={falloEsencial() ? "error" : "status"}
                data-setup-repair=""
                onDismiss={() => setDescartado(claveDelAviso())}
              >
                <p class="m-0 break-words text-xs text-neutral-950">
                  {falloEsencial()
                    ? t("setup.repair.failed", { name: nombreAReparar() })
                    : t("setup.repair.running", { name: nombreAReparar() })}
                </p>
              </Toast>
            </ToastPortal>
          </Show>
        </>
      }
    >
      <Match when={mostrar() === null}>
        <Esqueleto preparando={!conFoto} ControlesDeVentana={props.ControlesDeVentana} />
      </Match>
      <Match when={mostrar() && !seguir()}>
        <main class="flex h-full flex-col overflow-hidden bg-bg">
          <CabeceraDelAlta fase={alta() ? (paso() === "personalizar" ? 1 : 0) : undefined} ControlesDeVentana={props.ControlesDeVentana} />
          <Show
            when={!pideCuenta()}
            fallback={
              <Suspense fallback={<TarjetaVacia />}>
                <ConectarCuenta
                  onListo={() => {
                    setFallo(null);
                    setCuentaRespondida(true);
                  }}
                />
              </Suspense>
            }
          >
          <Show
            when={paso() === "personalizar"}
            fallback={
              <>
                <Escenario izquierda={izquierda()} derecha={derecha()} />
                {pie()}
              </>
            }
          >
            <Suspense fallback={<TarjetaVacia />}>
              <Personalizar
                workspace={workspace()}
                ia={nombres()}
                onAtras={() => setPaso("ia")}
                onListo={() => setSeguir(true)}
              />
            </Suspense>
          </Show>
          </Show>
        </main>
      </Match>
    </Switch>
  );
}
