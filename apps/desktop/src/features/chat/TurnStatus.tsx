import { Show, createMemo } from "solid-js";
import { t } from "../../lib/i18n";
import { enCurso, formatearDuracion, type Paso } from "../../lib/steps";
import { createNow } from "../../lib/sharedClock";
import { MachineIcon } from "../machines/MachineIcon";

// El rótulo sigue rotando durante las herramientas; la actividad va aparte.
// Esperar una respuesta o reintentar sí sustituye el rótulo de trabajo.
export default function EstadoDelTurno(props: {
  /** El paso que está corriendo, si hay uno. */
  paso: Paso | null;
  /** El turno preguntó algo y no puede seguir sin respuesta. */
  esperando: boolean;
  /**
   * El CLI está reintentando contra su proveedor. `null` mientras no lo anuncie
   * —y en los agentes que no lo anuncian, que son todos menos Claude—.
   */
  reintento: { intento: number; total: number; clase: string } | null;
  /** El agente contestó y está libre; lo que sigue corriendo es una hija. */
  enFondo: boolean;
  /**
   * Cuándo arrancó el turno, en epoch ms. `null` cuando no se sabe —un turno
   * que esta ventana no vio arrancar— y entonces se cuenta desde aquí.
   */
  desde: number | null;
  /**
   * La máquina de la tarea se está encendiendo para recibir este mensaje: el
   * turno ya salió y espera a que conteste. Hasta entonces no hay agente que
   * piense, y decir «Pensando» sería inventarlo.
   */
  encendiendo?: { name: string; wakes: boolean } | null;
}) {
  // Medirlo desde el montaje es lo que ponía el reloj a cero en cada
  // remontaje: cambiar de workspace, de pestaña o de tarea y volver.
  const montado = Date.now();
  const desde = () => props.desde ?? montado;
  const ahora = createNow();

  /**
   * Cuál de los verbos toca. **Del reloj y no de un temporizador propio**: dos
   * relojes para lo mismo es un renglón que parpadea dos veces por segundo.
   */
  const gracia = createMemo(() => {
    const lista = VERBOS();
    return lista[Math.floor((ahora() - desde()) / ROTA_CADA_MS) % lista.length];
  });

  const dice = createMemo(() => {
    if (props.encendiendo)
      return { verbo: t("chat.turn.waking", { name: props.encendiendo.name }), sujeto: null };
    if (props.esperando)
      return { verbo: t("chat.turn.waiting_answer"), sujeto: null };
    if (props.enFondo)
      return { verbo: t("chat.turn.waiting_background"), sujeto: null };
    // **Un reintento no es un verbo de broma.** Mientras el proveedor no
    // contesta, el rótulo deja de jugar y dice qué pasa y por dónde va: es
    // exactamente cuando la espera empieza a parecer un cuelgue.
    const r = props.reintento;
    if (r)
      return {
        verbo: t("chat.turn.retrying", { attempt: r.intento, total: r.total }),
        sujeto: null,
      };
    const p = props.paso;
    if (!p) return { verbo: gracia(), sujeto: null };
    const actividad = enCurso(p);
    // El comando no sale en este renglón: ya lo enseña su fila del registro, y
    // aquí una línea de shell envuelve varios renglones de fontanería.
    const detalle = p.clase === "ejecutar" ? null : actividad.sujeto;
    return {
      verbo: gracia(),
      sujeto: [actividad.verbo, detalle].filter(Boolean).join(" "),
    };
  });

  // Los primeros segundos no llevan reloj: un «0s» que aparece con el turno es
  // ruido, y la duda aparece después. Con el agente parado no lleva reloj
  // ninguno: el número contesta «¿esto sigue vivo?» de quien trabaja, y sobre
  // una hija cuenta el turno entero del padre. Cuántas hijas trabajan lo dice
  // su sección del sidebar.
  const cuanto = () => {
    if (props.enFondo) return null;
    const ms = ahora() - desde();
    return ms >= MUESTRA_EL_RELOJ_DESDE_MS ? formatearDuracion(ms) : null;
  };

  return (
    <p
      class="m-0 flex items-start gap-2 text-neutral-500 italic"
      // Se anuncia una vez y no en cada vuelta del rótulo: un lector de pantalla
      // repitiendo «Amasando… Rumiando… Destilando…» cada cuatro segundos es
      // exactamente el ruido que este renglón viene a quitar.
      role="status"
      aria-live="off"
      aria-label={
        props.encendiendo
          ? dice().verbo
          : props.esperando
          ? t("chat.turn.waiting_answer")
          : props.reintento || props.enFondo
            ? dice().verbo
            : t("chat.turn.working_aria")
      }
    >
      <Show
        when={props.encendiendo}
        fallback={
          <span
            class={
              "mt-[0.45em] size-[7px] shrink-0 rounded-full " +
              (props.enFondo
                ? "bg-neutral-500"
                : "bg-primary animate-danil-pulse")
            }
            aria-hidden="true"
          />
        }
      >
        {(m) => (
          <span class="mt-[0.2em] shrink-0 text-primary animate-danil-pulse" data-turn-waking="">
            <MachineIcon wakes={m().wakes} size={14} />
          </span>
        )}
      </Show>
      <span class="min-w-0">
        <span>{dice().verbo}</span>
        <Show when={!props.esperando && !props.reintento && !props.enFondo}>
          <span>…</span>
        </Show>
        <Show when={cuanto()}>
          {(d) => <span class="ml-1.5 text-xs tabular-nums">· {d()}</span>}
        </Show>
        <Show when={dice().sujeto}>
          {(s) => (
            <span class="ml-1.5 font-mono text-xs not-italic break-all">{s()}</span>
          )}
        </Show>
      </span>
    </p>
  );
}

/** Cada cuánto cambia el rótulo mientras el agente trabaja. */
const ROTA_CADA_MS = 4000;

/**
 * Desde cuándo se enseña el reloj.
 *
 * Un turno corto contesta antes de que nadie se pregunte nada, y ahí el número
 * solo aparece para irse. La duda —«¿esto sigue vivo?»— empieza cuando el
 * silencio ya se hizo raro.
 */
const MUESTRA_EL_RELOJ_DESDE_MS = 3000;

/**
 * Los rótulos de la espera.
 *
 * **Gerundios**, y ninguno afirma nada del trabajo: son la espera con cara, no
 * una descripción. Un verbo que dijera «Buscando» o «Leyendo» sin que eso esté
 * pasando sería inventarle actos al agente en el único renglón que existe para
 * decir la verdad de lo que hay. Quien traduzca el catálogo tiene el mismo
 * límite: doce gerundios que no prometen ningún acto.
 *
 * **Es una función y no un arreglo**, y esa es la parte que se rompe sola: un
 * `const VERBOS = [t(…)]` a nivel de módulo se evalúa al importarse, así que se
 * queda con la lengua de ese instante y cambiar de idioma no lo movería. Leído
 * dentro del `createMemo` que ya rastrea el reloj, se repinta con `lengua()`.
 */
const VERBOS = () => [
  t("chat.turn.verb.thinking"),
  t("chat.turn.verb.ruminating"),
  t("chat.turn.verb.pondering"),
  t("chat.turn.verb.scheming"),
  t("chat.turn.verb.cooking"),
  t("chat.turn.verb.kneading"),
  t("chat.turn.verb.distilling"),
  t("chat.turn.verb.splitting_hairs"),
  t("chat.turn.verb.connecting_dots"),
  t("chat.turn.verb.mulling"),
  t("chat.turn.verb.plotting"),
  t("chat.turn.verb.polishing"),
];
