import { marcaDeSuperficie } from "../../../../ui/src/lib/surfaces";
import ChevronRight from "lucide-solid/icons/chevron-right";
import { createEffect, createSignal, createUniqueId, type JSX, on, onMount, Show, untrack } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cancelLogin } from "../queries/engine-accounts";
import { cn } from "../../../../ui/src/lib/utils";
import { Badge } from "../../../../ui/src/Badge";
import { Button } from "../../../../ui/src/Button";
import { MarcaAgente } from "../../../../ui/src/icons";
import { accountPresentation } from "../screens/AccountCard";
import { SettingsSection } from "../../../../ui/src/SettingsLayout";
import { Pressable } from "../../../../ui/src/Pressable";
import type Accounts from "./AccountsView";
import type { createCuentas } from "./AccountsState";
import type { createConexionDeCuentas } from "./AccountsConnect";

export function createPartesDeCuentas(props: Parameters<typeof Accounts>[0], cuentas: ReturnType<typeof createCuentas>, conexion: ReturnType<typeof createConexionDeCuentas>) {
  const { conexionFallida, lista, tarjetas, enCurso, instalando, fallo, cargando, agentes, machineOf, setEnCurso, setPideCodigo, setPorConfirmar, setOfrecerTerminal, agente, estados } = cuentas;
  const { agregando, pidioExterno, faltaExterno, bloqueoAlta, agregar, setPidioExterno, cancelarEspera, segunda } = conexion;
  // PROVISIONAL hasta que se decida Q2: el panel de un alta cuyo login falló también deja el grupo a la vista.
  const falloALaVista = () => conexionFallida() !== null;
  // Las tareas en espera de cupo no lo mantienen: sin cuentas, la persona cambia el proveedor de la tarea.
  createEffect(() => props.onEstado?.({
    cuentas: lista() === null ? null : tarjetas.length,
    vivo: agregando() || enCurso() !== null || instalando() !== null || (pidioExterno() && faltaExterno()) || fallo() !== null || falloALaVista(),
    bloqueoAlta: bloqueoAlta(),
    falloDeLectura: lista() === null && !cargando() && fallo() !== null,
  }));
  onMount(() => props.onControl?.({ agregar: () => { setAbierto(true); void agregar(); } })); // Desde el selector: primero se despliega.
  createEffect(on(agentes, () => !faltaExterno() && setPidioExterno(false))); // Instalado: nada pendiente de «Ya lo instalé».

  function cancelarConexion() {
    const id = enCurso();
    if (id) cancelLogin({ id }, machineOf(id)).catch(() => {});
    cancelarEspera();
    setEnCurso(null);
    setPideCodigo(false);
    setPorConfirmar(null);
    setOfrecerTerminal(false);
  }

  const [abierto, setAbierto] = createSignal(untrack(() => props.desplegado ?? true));
  const idCuerpo = createUniqueId();
  const cuentaActiva = () => lista()?.accounts.find((a) => a.id === lista()?.active);

  const envolver = (cuerpo: JSX.Element, accion?: JSX.Element) =>
    props.titulo === undefined ? (
      <div class="grid min-w-0">
        {cuerpo}
        {props.children}
      </div>
    ) : (
      <SettingsSection
        title={
          <Pressable
            class="flex w-full min-w-0 items-center gap-2 rounded-sm bg-transparent p-0 text-left font-[inherit] text-neutral-950 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-expanded={abierto()}
            aria-controls={idCuerpo}
            onClick={() => setAbierto(!abierto())}
          >
            <span class="flex size-4 shrink-0 items-center justify-center">
              <MarcaAgente id={marcaDeSuperficie({ catalogo: props.soloGratuitos ? "gratuitos" : "todo", provider: agente() })} size={16} />
            </span>
            <span class="grid min-w-0 flex-1">
              <span class="truncate">{props.titulo}</span>
              <Show when={props.subtitulo}>
                <span class="truncate text-xs font-normal text-neutral-500">{props.subtitulo}</span>
              </Show>
            </span>
            <span class="flex shrink-0 items-center font-normal">{props.marca}</span>
            {/* Plegada, la cabecera dice con qué cuenta trabaja el proveedor; el conteo se ve siempre. */}
            <Show when={!props.soloGratuitos && lista()}>
              <span class="flex min-w-0 items-center gap-1.5 text-xs font-normal text-neutral-500">
                <Show when={!abierto() ? cuentaActiva() : undefined}>
                  {(activa) => (<>
                    <span class="truncate font-medium text-neutral-700">{accountPresentation(activa(), estados()[activa().id]).name}</span>
                    <Badge tone="success" class="shrink-0">{t("settings.account_card.active")}</Badge>
                  </>)}
                </Show>
                <span class="shrink-0" data-account-count="">{t("settings.accounts.count", { count: tarjetas.length })}</span>
              </span>
            </Show>
            <ChevronRight
              size={16}
              aria-hidden
              class={cn(
                "shrink-0 text-neutral-500 transition-transform duration-150 ease-out motion-reduce:transition-none",
                abierto() && "rotate-90",
              )}
            />
          </Pressable>
        }
      >
        {/* Plegada se oculta y no se desmonta: una conexión en curso vive aquí. */}
        <div id={idCuerpo} class={cn("@container min-w-0 pl-6", abierto() ? "grid" : "hidden")} data-provider-group={agente()}>
          {cuerpo}
          {props.children}
          {accion}
        </div>
      </SettingsSection>
    );

  const botonAgregar = (forma: "aside" | "fila" | "bloque") => (
    <Button
      variant={forma === "aside" ? "ghost" : forma === "fila" ? "secondary" : "primary"}
      size={forma === "aside" ? "compact" : "sm"}
      onClick={() => void agregar()}
      disabled={bloqueoAlta() !== null}
      /* **La segunda cuenta de un agente que no aísla su credencial no se
         ofrece.** No es una advertencia encima del botón: el botón no se
         puede usar y dice por qué. Conectarla reemplazaría la sesión de la
         primera dejándola con cara de conectada, y el gasto de un cliente
         saldría de la suscripción del otro sin nada que avisara. */
      title={segunda() ?? undefined}
    >
      {t("settings.accounts.add")}
    </Button>
  );
  const hayCuentas = () => (lista()?.accounts.length ?? 0) > 0;
  return { envolver, botonAgregar, hayCuentas, cancelarConexion };
}
