import { createSignal, lazy, onMount, Show, Suspense } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { Button } from "../../ui/Button";
import { FailureNote, asFailure, prosaDe } from "../../ui/Failure";
import { crearConexiones } from "./connect-store";
import { Comprobacion, MapaDeConexiones, PanelDeIA } from "./ConnectAI";
import { accountWelcomeAnswered } from "./account-welcome";
import { crearWorkspace } from "./onboarding-store";
import Personalizar from "./Personalize";
import { CabeceraDelAlta } from "./Phases";
import { Escenario, TituloCambiante } from "./Stage";

/**
 * El alta sin preparación pendiente: conectar la IA y personalizar. La primera
 * vez la pinta `Setup.tsx` tras preparar; aquí llega la app sin workspace.
 */
// Una computadora gestionada llega preparada y con sus asistentes: en el navegador el alta es otra.
const AltaGestionada = lazy(() => import("../../web/Onboarding"));
const ConectarCuenta = lazy(() => import("./ConnectAccount"));

type Props = { onListo: () => void };

/** La primera alta de esta computadora pregunta antes por la cuenta de Danil. */
export default function Onboarding(props: Props) {
  if (!capabilities().localSetup) return <AltaGestionada {...props} />;
  const [respondida, setRespondida] = createSignal(accountWelcomeAnswered());
  const [puedeVolver, setPuedeVolver] = createSignal(false);
  const [tomado, setTomado] = createSignal<{ id: string; nombre: string } | null>(null);
  return (
    <Show
      when={respondida()}
      fallback={
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg">
          <CabeceraDelAlta fase={0} />
          <Suspense fallback={null}>
            <ConectarCuenta
              onListo={(r) => {
                setTomado(r.workspace ?? tomado());
                setPuedeVolver(!r.connected);
                setRespondida(true);
              }}
            />
          </Suspense>
        </div>
      }
    >
      <AltaLocal {...props} tomado={tomado()} onWorkspace={setTomado} onAtras={puedeVolver() ? () => setRespondida(false) : undefined} />
    </Show>
  );
}

function AltaLocal(props: Props & { tomado: { id: string; nombre: string } | null; onWorkspace: (w: { id: string; nombre: string }) => void; onAtras?: () => void }) {
  const [paso, setPaso] = createSignal<"ia" | "personalizar">("ia");
  const [workspace, setWorkspace] = createSignal<{ id: string; nombre: string } | null>(null);
  const [fallo, setFallo] = createSignal<string | null>(null);
  const conexiones = crearConexiones();

  async function crear() {
    setFallo(null);
    try {
      if (props.tomado) {
        setWorkspace(props.tomado);
      } else {
        const nombre = t("onboarding.workspace.default");
        const w = await crearWorkspace(nombre);
        setWorkspace({ id: w.id, nombre });
        props.onWorkspace({ id: w.id, nombre });
      }
      await conexiones.cargar();
    } catch (e) {
      setFallo(prosaDe(e));
    }
  }
  onMount(() => void crear());

  const conectadas = () => conexiones.conectadas();

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg">
      <CabeceraDelAlta fase={paso() === "ia" ? 0 : 1} />
      <Show
        when={paso() === "personalizar"}
        fallback={
          <>
            <Escenario
              izquierda={
                <>
                  <TituloCambiante titulo={t("onboarding.ai.title")} />
                  <Show when={fallo()}>
                    {(f) => (
                      <div class="mt-6">
                        <FailureNote f={asFailure(f())} />
                      </div>
                    )}
                  </Show>
                  <div class="flex flex-1 flex-col justify-center">
                    <MapaDeConexiones c={conexiones} />
                  </div>
                  <div>
                    <div class="mt-4 border-t border-border pt-4">
                      <Comprobacion
                        filas={[
                          {
                            hecho: conectadas().length > 0,
                            texto: conectadas().length
                              ? t("onboarding.check.ai_connected", {
                                  count: conectadas().length,
                                  names: conectadas().map(conexiones.nombre).join(", "),
                                })
                              : t("onboarding.check.ai_pending"),
                          },
                          { hecho: false, texto: t("onboarding.check.personalize") },
                        ]}
                      />
                    </div>
                  </div>
                </>
              }
              derecha={<PanelDeIA c={conexiones} />}
            />
            <footer class="flex flex-wrap items-center gap-2.5 border-t border-border px-5 py-3.5">
              <Show when={props.onAtras && workspace()}>
                <Button size="sm" variant="ghost" onClick={props.onAtras}>
                  {t("onboarding.back")}
                </Button>
              </Show>
              <span class="flex-1" />
              <Button size="sm" disabled={conectadas().length === 0 || !workspace()} onClick={() => setPaso("personalizar")}>
                {t("onboarding.continue")}
              </Button>
            </footer>
          </>
        }
      >
        <Personalizar
          workspace={workspace()}
          ia={conectadas().map(conexiones.nombre)}
          onAtras={() => setPaso("ia")}
          onListo={props.onListo}
        />
      </Show>
    </div>
  );
}
