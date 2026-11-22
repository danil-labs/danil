import { type JSX, Show, Suspense } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { prosa } from "../../../../../apps/desktop/src/lib/prose";
import { Button } from "../../../../ui/src/Button";
import { FailureNote } from "../../../../ui/src/Failure";
import { Skeleton } from "../../../../ui/src/Skeleton";
import type { MaquinasDeAjustes } from "../model/machines-port";
import { SettingsBlock, SettingsRow } from "../../../../ui/src/SettingsLayout";
import { ModelosGratuitos } from "./FreeRouterRow";
import type { EstadoDeProveedor } from "../model/ai-providers-groups";
import { createCuentas } from "./AccountsState";
import { createConexionDeCuentas } from "./AccountsConnect";
import { createAccionesDeCuentas } from "./AccountsActions";
import { createPartesDeCuentas } from "./AccountsParts";
import { createListaDeCuentas } from "./AccountsList";
import { createDialogosDeCuentas } from "./AccountsDialogs";
import { LocalKeysBanner } from "./AccountsModel";

/**
 * Vive dentro de la configuración: pregunta por los agentes y se queda con
 * el suyo.
 *
 * `agente` fija cuál; lo usa `AIProviders.tsx`, donde cada agente es una fila
 * propia.
 *
 * `soloGratuitos` monta únicamente la activación, sin la lista de cuentas:
 * con qué clave trabajas y que tu material salga de la máquina son dos
 * decisiones distintas.
 */
export default function Accounts(props: {
  agente: string;
  soloGratuitos?: boolean;
  /** Con título, las filas van en su propia sección y «Agregar cuenta» a su derecha. */
  titulo?: string;
  /** La línea debajo del título. */
  subtitulo?: string;
  /** El nombre de la fila cuando no hay cuentas, o el de la activación. */
  nombre?: string;
  /** Lo que le falta a la superficie, junto al título o al nombre. */
  marca?: JSX.Element;
  /** Las filas de las otras superficies del mismo proveedor, al final de la sección. */
  children?: JSX.Element;
  /** Con título, si la sección llega desplegada. Se lee al montar. */
  desplegado?: boolean;
  /** Para la pantalla (`ai-providers-groups.ts`): lo que decide si el grupo se ve, el mismo `agregar()` del botón para su selector, y sin botón propio. */
  onEstado?: (e: EstadoDeProveedor) => void; onControl?: (c: { agregar: () => void }) => void; sinAgregar?: boolean;
  /** Lo de máquinas: a qué máquina va cada orden. */
  maquinas: MaquinasDeAjustes;
}) {
  const cuentas = createCuentas(props);
  const { agentes, agente, instalando, fallo, lista, cargando, esperando, reponiendo, repuestas, enCurso, conexionFallida, setConexionFallida } = cuentas;
  const conexion = createConexionDeCuentas(cuentas);
  const { inferencia, revisandoCli, instalarCli, acto, etiqueta, proveedor, externalInstallUrl, comprobarCli, sinCuenta, refrescar, claveDe, segunda, conectar, terminalLocal } = conexion;
  const acciones = createAccionesDeCuentas(cuentas, conexion);
  const { reponer } = acciones;
  const partes = createPartesDeCuentas(props, cuentas, conexion);
  const { envolver, botonAgregar, hayCuentas } = partes;
  const { Lista } = createListaDeCuentas(props, cuentas, conexion, acciones, partes);
  const { DialogoDeClave, DialogoDeConfirmacion } = createDialogosDeCuentas(cuentas, conexion, acciones, partes);
  // La activación sola, sin la lista de cuentas: es un destino propio del
  // riel, con su decisión aparte. Ver `soloGratuitos`.
  //
  // Sí trae la instalación: esta pantalla prueba la app sin traer una
  // suscripción propia, y sin instalación el interruptor quedaría en verde
  // con el chat diciendo «no instalado» sin nada que pulsar. Instalar no es
  // una pregunta (`AGENTS.md`): no hay botón aparte, cuelga del acto que la
  // persona ya eligió —activar— y solo se ve su progreso.
  //
  // Cuelga del estado, no solo del acto: colgarlo solo de activar dejaría
  // fuera a quien ya activó antes, con «activados» encima de algo que no
  // puede correr. `preparar` va sin definir cuando el binario ya está, y eso
  // deja al bloque de abajo decir la verdad en los dos casos.
  if (props.soloGratuitos) {
    return envolver(
      <>
        {/* El mismo bloque que la otra superficie, en el mismo sitio:
            regla de `AGENTS.md` para cuando algo no está en la máquina, y las
            dos filas de OpenCode contestan igual.

            Instalar y consentir siguen siendo dos actos, dos botones. Activar
            sigue trayendo el binario si falta —bajar cien megas antes de
            aceptar sería gastar disco por una pregunta que puede contestarse
            que no—; esto es para quien quiere el binario y no ha decidido lo
            otro.

            Las dos comparten paquete y carpeta (`agents::Install::carpeta`):
            instalar desde cualquiera las quita de las dos, con el evento
            `providers` haciéndolas releer `list_providers`. */}
        <Show when={!agentes().find((a) => a.id === agente())?.available}>
          {/* Sin la fila de abajo (motor que no declara el agente) esta lleva el nombre: la fila nunca queda anónima. */}
          <SettingsRow label={inferencia() === "sin_pedir_nada" ? "" : props.nombre ?? ""}>
            <Button size="sm" disabled={Boolean(instalando()) || revisandoCli()} onClick={() => void instalarCli()}>
              {instalando() ? acto().curso : acto().boton}
            </Button>
          </SettingsRow>
        </Show>

        <Show when={inferencia() === "sin_pedir_nada"}>
          <ModelosGratuitos
            nombre={props.nombre ?? etiqueta()}
            marca={props.titulo === undefined ? props.marca : undefined}
            agente={agente()}
            proveedor={etiqueta()}
            falta={!agentes().find((a) => a.id === agente())?.available}
            preparar={proveedor()?.available ? undefined : instalarCli}
            preparando={Boolean(instalando())}
          />
        </Show>
        <Show when={fallo()}>
          {(f) => (
            <SettingsBlock>
              <FailureNote f={f()} />
            </SettingsBlock>
          )}
        </Show>
      </>,
    );
  }
  return envolver(
    <>
      {/* Sin cuentas no se enseña la lista, ni vacía: una lista vacía con su
          botón de agregar diría «todavía no conectaste ninguna», falso y una
          promesa que no va a pasar. Lo que va aquí es de qué depende. */}
      {/* Lo que falta se nombra y se ofrece, también donde no hay cuenta que
          conectar: conectar ya instalaba el CLI si faltaba, pero un agente
          `sin_cuenta` no tiene ese botón, y su pantalla dejaba a la persona
          sin ninguna salida. */}
      <Show when={!agentes().find((a) => a.id === agente())?.available}>
        <SettingsBlock class="justify-items-start">
          <Button
            size="sm"
            disabled={Boolean(instalando()) || revisandoCli()}
            onClick={() => void instalarCli()}
          >
            {instalando() ? acto().curso : acto().boton}
          </Button>
          <Show when={externalInstallUrl()}>
            <p class="text-xs text-neutral-500">{t("settings.accounts.external_required", { agent: etiqueta() })}</p>
            <Button variant="secondary" size="sm" disabled={revisandoCli()} onClick={() => void comprobarCli()}>
              {t("settings.accounts.check_installed")}
            </Button>
          </Show>
        </SettingsBlock>
      </Show>

      {/* El consentimiento va antes que la lista de cuentas, no después: lo
          que se acepta aquí no es un ajuste, es que el material de un
          cliente salga de esta computadora. Conectar cuenta, que da el
          catálogo completo, es el bloque de abajo y es otra decisión. */}
      <Show when={!sinCuenta()}>
      <Show when={fallo()}>
        {(f) => (
          <SettingsBlock>
            <FailureNote f={f()} />{/* La lista caída se vuelve a pedir aquí (S6). */}<Show when={lista() === null && !cargando()}><Button size="sm" variant="secondary" class="justify-self-start" onClick={() => void refrescar()}>{t("settings.accounts.retry")}</Button></Show>
          </SettingsBlock>
        )}
      </Show>

      <Show when={cargando()}>
        <SettingsBlock>
          <Skeleton filas={2} />
        </SettingsBlock>
      </Show>

      <Show when={esperando().length}>
        {(n) => (
          <SettingsRow label={t("settings.accounts.awaiting", { count: n() })}>
            <Button
              variant="outline"
              size="compact"
              onClick={() => void reponer()}
              disabled={reponiendo()}
            >
              {t("settings.accounts.awaiting_resume", { count: n() })}
            </Button>
          </SettingsRow>
        )}
      </Show>

      <Show when={repuestas() !== null}>
        <SettingsBlock>
          <p class="m-0 text-ui leading-[19px] text-neutral-500">
            {t("settings.accounts.awaiting_resumed", { count: repuestas() ?? 0 })}
          </p>
        </SettingsBlock>
      </Show>

      {/* Con la lista caída no se sabe si hay cuentas: ofrecer la primera diría que hay 0. */}
      <Show when={lista()?.accounts.length === 0 && !props.sinAgregar}>
        <SettingsRow
          label={props.nombre ?? t("settings.accounts.connect_agent", { agent: etiqueta() })}
        >
          {botonAgregar("fila")}
        </SettingsRow>
      </Show>

      <Show when={claveDe()}>
        <Suspense fallback={null}>
          <LocalKeysBanner kinds={["api_key"]} maquinas={props.maquinas} />
        </Suspense>
      </Show>

      {/* Por el ancho del grupo, no de la ventana: tarjetas de 24rem como mínimo (la tarjeta caída cabe con sus acciones completas desde 266 px; su correo completo pide 444 y se trunca con `title` si no cabe), 2 columnas desde 776 px y 3 desde 1168 px de lista; nunca más de 3. La lista recupera la sangría `pl-6` del cuerpo (`-ml-6`) para dejar margen sobre esos cortes. */}
      <Lista />

      {/* Dónde acaba el secreto de este agente, cuando no es el llavero. No
          deshabilita nada y no va encima de un control: la cuenta funciona y
          es independiente. Hace legible el renglón en inglés que el CLI de
          Antigravity escribe a mitad del login —«keychain not found»—, que
          sin esto se lee como que la conexión falló. */}
      <Show when={lista()?.secret_note}>
        {(nota) => (
          <SettingsBlock>
            <p class="m-0 max-w-[62ch] text-ui leading-[19px] text-neutral-500">
              {prosa(nota())}
            </p>
          </SettingsBlock>
        )}
      </Show>

      {/* `Button` deshabilitado no recibe el puntero: su `title` nunca se ve. */}
      <Show when={segunda()}>
        {(porque) => (
          <SettingsBlock>
            <p class="m-0 max-w-[62ch] text-ui leading-[19px] text-neutral-500" data-shared-credential="">
              {porque()} {t("settings.accounts.shared_remove_first")}
            </p>
          </SettingsBlock>
        )}
      </Show>

      <Show when={props.titulo === undefined && hayCuentas() && !props.sinAgregar}>
        <SettingsBlock class="justify-items-start">{botonAgregar("bloque")}</SettingsBlock>
      </Show>

      {/* La conexión es un modal, no una caja dentro de la tarjeta.

          `add_account` emite el evento `account`; `Settings.tsx` lo escucha y
          vuelve a pedir `list_surfaces`. Su `<For>` reconcilia por
          referencia, y un array nuevo recrea todas las filas: el `<details>`
          volvería a montarse cerrado —su `open` solo vive en el DOM— y con
          él se destruiría este componente, que guarda `enCurso`, `url` y
          `pideCodigo`. No se «cerraría una ventana»: se tiraría el estado de
          la conexión mientras su proceso sigue vivo, con el login del CLI
          todavía esperando el código y su carpeta ya borrada debajo.

          El diálogo se pinta fuera del árbol de la tarjeta: aunque la fila
          se recree, la conexión no depende de que su tarjeta siga abierta.
          Mismo recurso que `Consentir`: lo que no se puede interrumpir no se
          dibuja dentro de algo que se puede plegar.

          Sigue faltando que recrear la fila no destruya el componente. Eso
          se arregla en quien pinta la lista. */}
      <DialogoDeClave />

      {/* Conectar con una clave: un campo y el enlace donde se consigue.
          Pedirle a quien opera el negocio que navegue un menú de terminal es
          pedirle que programe. OpenCode ya no entra por aquí.

          El enlace va primero, en el orden en que ocurre: sin clave no hay
          nada que pegar. La URL viene de la tabla, genérica: sirve antes de
          estar autenticado, que es cuando hace falta. */}
      {/* Al modal por el mismo motivo que la conexión de arriba: se llega aquí
          pulsando «Agregar cuenta», que es justo el gesto que recrea la fila y
          plegaba la tarjeta con el campo dentro. */}
      <DialogoDeConfirmacion />

      {/* La conexión terminó mal. El panel de arriba ya se cerró —el proceso
          murió—, y el motivo y la salida viven aquí hasta que se reintente:
          cerrarlo dejaría reintentando a ciegas. */}
      <Show when={!enCurso() && conexionFallida()}>
        {(f) => (
          <SettingsBlock>
          <div class="flex flex-col gap-2 rounded-md border border-primary px-3 py-2.5">
            <div class="flex items-center justify-between text-xs font-semibold">
              <span>{t("settings.accounts.failed_title")}</span>
              <Button
                variant="outline"
                size="compact"
                onClick={() => setConexionFallida(null)}
              >
                {t("settings.accounts.close")}
              </Button>
            </div>
            <span class="break-all font-mono text-xs">{f().texto}</span>
            <div class="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <Button size="sm" onClick={() => void conectar(f().id)}>
                {t("settings.accounts.retry")}
              </Button>
              <Show when={terminalLocal(f().id)}>
                <Button
                  variant="outline"
                  size="compact"
                  onClick={() => void conectar(f().id, "terminal")}
                >
                  {t("settings.accounts.open_terminal")}
                </Button>
              </Show>
            </div>
          </div>
          </SettingsBlock>
        )}
      </Show>
      </Show>
    </>,
    <Show when={!sinCuenta() && hayCuentas() && !props.sinAgregar}>
      <div class="flex pt-2">{botonAgregar("aside")}</div>
    </Show>,
  );
}
