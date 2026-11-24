import { For, Show } from "solid-js";
import { openExternal } from "../queries/engine-open";
import { Button } from "../../../../ui/src/Button";
import { cn } from "../../../../ui/src/lib/utils";
import { MarcaProveedor } from "../../../../ui/src/icons";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { prosa } from "../../../../ui/src/lib/prose";
import { Badge } from "../../../../ui/src/Badge";
import { Pressable } from "../../../../ui/src/Pressable";
import type { createHerramientas } from "./ToolsState";
import { estado, autorizaElMotor, MOTOR } from "./ToolsModel";

export function createListaDeHerramientas(herramientas: ReturnType<typeof createHerramientas>) {
  const { instalados, reciben, noReciben, puestos, probando, probar, servicios, activaDe, salud, enCurso, claveLogin, iniciarSesion, urlDeLogin, quitarEnCurso, ocupado, bloqueado, conmutar, elegir, cerrarSesion } = herramientas;
  const Lista = () => (
    <section class="grid grid-cols-[minmax(0,1fr)] gap-2">
      {/* Una línea, solo de lo que está en esta máquina: nombrar lo que no
          está no ayuda a nadie, para eso está el riel, que ya lo marca.
          Solo importa a qué llega lo que conectes.

          Un chip por agente: siete nombres unidos por «y» no se leían de
          un vistazo.

          Encabeza la sección sin título encima: el renglón activo del riel
          ya nombra esta pantalla, y repetirlo arriba es el rótulo
          redundante que el sistema visual descarta. */}
      <Show when={instalados().length > 0}>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-neutral-500">
            <span>{t("settings.tools.reaches")}</span>
            <Show
              when={reciben().length > 0}
              fallback={<span class="font-medium text-neutral-950">{t("settings.tools.nobody")}</span>}
            >
              <For each={reciben()}>{(a) => <Badge tone="active">{a.label}</Badge>}</For>
            </Show>
            {/* Juntos, para que el rótulo no quede huérfano al partir. */}
            <Show when={noReciben().length > 0}>
              <span class="ml-1.5 flex flex-wrap items-center gap-1.5">
                <span>{t("settings.tools.not_yet")}</span>
                <For each={noReciben()}>{(a) => <Badge>{a.label}</Badge>}</For>
              </span>
            </Show>
          </div>
          <Show when={puestos().length > 0}>
            <Button
              variant="ghost"
              size="sm"
              class="shrink-0"
              disabled={probando()}
              onClick={() => void probar()}
            >
              {probando()
                ? t("settings.tools.testing")
                : t("settings.tools.test")}
            </Button>
          </Show>
        </div>
      </Show>

      <ul class="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0">
        <For each={servicios()}>
          {(formas) => {
            /** El camino del que habla la tarjeta. Ver `activaDe`. */
            const c = () => activaDe(formas);
            const chip = () => estado(c(), salud()[c().id]);
            /** Un local con la app cerrada. `undefined` en los remotos. */
            const muerta = () => c().escuchando === false;
            /** Con la sesión del motor la tarjeta dice «conectado» y nada más. */
            const listaYa = () => autorizaElMotor(c()) && c().conectado && (c().sesiones ?? []).length > 0;
            const requiere = () => (listaYa() ? null : c().requiere);
            const despues = () => c().conectado && !listaYa();

            return (
              <li class="grid grid-cols-[minmax(0,1fr)] gap-1.5 rounded-md border border-border bg-surface-raised px-3 py-2.5">
                {/* En angosto, chip y botón bajan de renglón. */}
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  {/* El servicio, una vez. Las filas del grupo comparten
                      `name` — el camino lo dice el control de abajo. */}
                  {/* Base propia, no `flex-1`: con base cero el nombre se
                      encogía hasta «F…» en vez de bajar el chip. */}
                  <span class="flex min-w-0 flex-[1_1_10rem] items-center gap-2 text-ui font-semibold">
                    <MarcaProveedor id={formas[0].grupo} size={16} />
                    <span class="truncate">{formas[0].name}</span>
                  </span>
                  {/* `active` rellena con `neutral-200`, el color de la
                      tarjeta en oscuro: «conectado» se quedaba sin chip. */}
                  <Badge
                    tone={chip().tono}
                    class={cn("shrink-0", chip().tono === "active" && "bg-neutral-300")}
                  >
                    {chip().texto}
                  </Badge>
                  {/* Sin sesión del motor, iniciarla es lo que falta. Mientras
                      dura se puede abrir la página si el navegador no se
                      abrió solo, o cancelar. */}
                  <Show when={autorizaElMotor(c()) && c().conectado && (c().sesiones ?? []).length === 0}>
                    <Show
                      when={enCurso().has(claveLogin(MOTOR, c().id))}
                      fallback={
                        <Button
                          variant="secondary"
                          size="sm"
                          class="shrink-0"
                          onClick={() => void iniciarSesion(MOTOR, c().id)}
                        >
                          {t("settings.tools.login")}
                        </Button>
                      }
                    >
                      <span class="flex shrink-0 items-center gap-1">
                        <Show
                          when={urlDeLogin()}
                          fallback={<span class="text-xs text-neutral-500">{t("settings.tools.opening")}</span>}
                        >
                          {(u) => (
                            <Button
                              variant="ghost"
                              size="sm"
                              class="px-2 text-xs"
                              onClick={() => void openExternal({ target: u() })}
                            >
                              {t("settings.tools.open_login")}
                            </Button>
                          )}
                        </Show>
                        <Button
                          variant="ghost"
                          size="sm"
                          class="px-2 text-xs text-neutral-500"
                          onClick={() => quitarEnCurso(claveLogin(MOTOR, c().id))}
                        >
                          {t("settings.tools.cancel_login")}
                        </Button>
                      </span>
                    </Show>
                  </Show>
                  {/* Ni conectar ni quitar son acciones del agente: ninguno
                      va en morado. La forma la da la jerarquía: conectar es
                      la acción de la fila y quitar es lo que se hace una
                      vez. */}
                  <Button
                    variant={c().conectado ? "ghost" : "secondary"}
                    size="sm"
                    class="shrink-0"
                    disabled={ocupado() === c().id || bloqueado()}
                    onClick={() => void conmutar(c())}
                  >
                    {/* El gerundio dice cuál de las dos cosas está
                        ocurriendo, sin mover la fila entera al pulsar. */}
                    {ocupado() === c().id
                      ? c().conectado
                        ? t("settings.tools.removing")
                        : t("settings.tools.connecting")
                      : c().conectado
                        ? t("settings.tools.remove")
                        : t("settings.tools.connect")}
                  </Button>
                </div>

                {/* La elección entre caminos, solo si hay más de uno: forma
                    de Apariencia en Contexto principal, son pocos y se
                    comparan de un vistazo. Dice sola lo que dos tarjetas no
                    podían — que es un servicio y elegir uno descarta el
                    otro. */}
                <Show when={formas.length > 1}>
                  <div
                    role="radiogroup"
                    aria-label={t("settings.tools.how_to_connect", {
                      name: formas[0].name,
                    })}
                    class="inline-flex w-fit gap-0.5 rounded-md border border-border bg-surface-muted p-0.5"
                  >
                    <For each={formas}>
                      {(f) => (
                        <Pressable
                          role="radio"
                          aria-checked={c().id === f.id}
                          disabled={ocupado() !== null || bloqueado()}
                          class={cn("rounded-sm px-2.5 py-1 text-xs text-neutral-500 disabled:pointer-events-none",
                            c().id === f.id
                              ? ["bg-neutral-200", "text-neutral-950", "shadow-sm"]
                              : "hover:bg-surface-raised",
                          )}
                          onClick={() => void elegir(formas, f)}
                        >
                          {f.via ? prosa(f.via) : ""}
                        </Pressable>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Qué hace falta antes de pulsar, y qué pasa después solo
                    cuando ya está conectado: antes sería una instrucción de
                    algo que no ha ocurrido.

                    Los dos en un bloque gris a 12 px, no a los 11 px de una
                    ruta: son frases, no metadatos, y la jerarquía la ponen
                    el nombre en negrita y el chip.

                    La advertencia del local muerto va aquí también mientras
                    no esté conectado, en gris: sin conectar no pasa nada, es
                    un requisito más, y en ámbar competiría con la tarjeta
                    que sí funciona. */}
                <Show when={requiere() || despues() || muerta()}>
                  <div class="grid gap-1 text-xs text-neutral-500">
                    <Show when={requiere()}>
                      {(q) => <p class="m-0">{prosa(q())}</p>}
                    </Show>
                    <Show when={muerta() && !c().conectado}>
                      <p class="m-0">{t("settings.tools.dead_before")}</p>
                    </Show>
                    <Show when={despues()}>
                      <p class="m-0">{prosa(c().despues)}</p>
                    </Show>
                  </div>
                </Show>

                {/* Un servidor local que no responde rompe todos los
                    turnos, no solo los que hablan de él: el agente abre sus
                    conexiones al arrancar cada turno, y el transporte
                    muerto sale como error fatal.

                    En ámbar solo cuando está conectado, cuando el daño está
                    ocurriendo. Sin conectar la misma frase vive arriba, en
                    gris. */}
                <Show when={muerta() && c().conectado}>
                  <p class="m-0 text-xs text-warning-strong">
                    {t("settings.tools.dead_now")}
                  </p>
                </Show>

                {/* Lo que contestó al hablarle en MCP ya está en el chip; aquí
                    solo queda lo que el chip no puede decir: qué mirar. */}
                <Show
                  when={
                    c().conectado &&
                    !muerta() &&
                    salud()[c().id] &&
                    salud()[c().id] !== "listo" &&
                    salud()[c().id] !== "pide-sesion"
                  }
                >
                  <p class="m-0 text-xs text-warning-strong">
                    {t("settings.tools.no_answer")}
                  </p>
                </Show>

                {/* La sesión es de Figma, no de Codex: una fila por agente,
                    qué toca hacer con cada uno — no un botón suelto que se
                    lea como si el servicio solo sirviera con ese agente.

                    Un turno no interactivo no puede abrir un navegador ni
                    esperar una aprobación: sin decirlo en su fila, la
                    herramienta no cargaba nunca y el agente contestaba que
                    el servidor estaba «registrado pero sin autorizar».
                    `claude mcp login` existe y funciona (`agents::McpLogin`).

                    El texto de reserva no es uno solo: sale de la tabla
                    (`sin_login`), con dos «no» distintos. En Grok y
                    Antigravity está medido que su CLI no ofrece ninguna
                    forma de autenticar —sirven los servidores locales y los
                    que llevan su credencial en la config, no los de OAuth—,
                    y eso no es un pendiente nuestro; «sin comprobar» sí lo
                    es.

                    Las dos filas pesan lo mismo: contestan la misma
                    pregunta, cómo se autentica cada agente, y las dos
                    dicen lo que va a pasar cuando el agente lo use. En
                    `ghost` el botón conserva el alto y el sitio de la fila
                    sin gritar. */}
                <Show when={c().conectado && c().pide_sesion && !autorizaElMotor(c()) && reciben().length > 0}>
                  <div class="mt-0.5 grid gap-1 border-t border-border pt-2">
                    <p class="m-0 text-caption font-medium uppercase tracking-wide text-neutral-500">
                      {t("settings.tools.session")}
                    </p>
                    <For each={reciben()}>
                      {(a) => (
                        <div class="flex min-h-8 items-center gap-2">
                          <span class="min-w-0 flex-1 truncate text-xs">
                            {a.label}
                          </span>
                          <Show
                            when={a.login}
                            fallback={
                              <span class="min-w-0 text-right text-xs text-neutral-500">
                                {a.sin_login
                                  ? prosa(a.sin_login)
                                  : t("settings.tools.login_unknown")}
                              </span>
                            }
                          >
                            {/* Mientras dura, se puede salir: si el
                                navegador no se abre solo, la URL que
                                imprimió el CLI se ofrece aquí, y cancelar
                                devuelve la fila al momento — sin esto no
                                hay forma de reintentar ni de saber a dónde
                                ir. */}
            {/* Con sesión ya iniciada no se ofrece iniciarla otra vez: el
                login vuelve a registrar el servidor, y registrar de cero
                se lleva la credencial que había. */}
                            <Show
                              when={enCurso().has(claveLogin(a.id, c().id))}
                              fallback={
                                <Show
                                  when={!(c().sesiones ?? []).includes(a.id)}
                                  fallback={
                                    <span class="flex shrink-0 items-center gap-1">
                                      <Badge tone="success">
                                        {t("settings.tools.session_on")}
                                      </Badge>
                                      {/* Cerrarla devuelve el botón de
                                          iniciar: es la única salida
                                          cuando la credencial caducó. */}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        class="px-2 text-xs text-neutral-500"
                                        onClick={() =>
                                          void cerrarSesion(a.id, c().id)
                                        }
                                      >
                                        {t("settings.tools.logout")}
                                      </Button>
                                    </span>
                                  }
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    class="shrink-0 px-2 text-xs"
                                    onClick={() => void iniciarSesion(a.id, c().id)}
                                  >
                                    {t("settings.tools.login")}
                                  </Button>
                                </Show>
                              }
                            >
                              <span class="flex shrink-0 items-center gap-1">
                                <Show
                                  when={urlDeLogin()}
                                  fallback={
                                    <span class="text-xs text-neutral-500">
                                      {t("settings.tools.opening")}
                                    </span>
                                  }
                                >
                                  {(u) => (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      class="px-2 text-xs"
                                      onClick={() => {
                                        void openExternal({ target: u() });
                                      }}
                                    >
                                      {t("settings.tools.open_login")}
                                    </Button>
                                  )}
                                </Show>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  class="px-2 text-xs text-neutral-500"
                                  onClick={() => quitarEnCurso(claveLogin(a.id, c().id))}
                                >
                                  {t("settings.tools.cancel_login")}
                                </Button>
                              </span>
                            </Show>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
    </section>
  );
  return { Lista };
}
