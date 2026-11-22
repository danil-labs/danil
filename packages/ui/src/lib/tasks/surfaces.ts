import { canonicalAgentId, OPENCODE } from "./agents.ts";

/**
 * Con qué modelo y por qué superficie sigue una tarea: la misma regla en la
 * ventana y en el teléfono. La ventana la re-exporta desde
 * `apps/desktop/src/lib/surfaces.ts` y `features/chat/transcript.ts`; el
 * teléfono, desde `apps/mobile/src/lib/engine.ts`. Espeja
 * `src-tauri/src/runtime/surfaces.rs` del motor.
 */

/**
 * Un renglón elegible (`list_surfaces`, `surfaces::Superficie`). Una fila de
 * agente da una: `opencode` (Go) y `free-router-opencode` (Free Router). Un
 * motor anterior todavía parte `opencode-zen` en dos. Los campos son los del cable.
 */
export type Surface<Phrase = unknown> = {
  id: string;
  /** La fila que la sirve. Es lo que viaja a `send_message` y lo que la sesión guarda. */
  provider: string;
  label: string;
  /** Qué mitad del catálogo de su agente ofrece. */
  catalogo: "todo" | "de_pago" | "gratuitos";
  /** Si se puede correr un turno por aquí ahora mismo. */
  usable: boolean;
  /** Qué le falta, en dos palabras. */
  marca: string | null;
  /** La frase entera: qué pasa y dónde se arregla. */
  porque: Phrase | null;
};

/** Lo que una superficie necesita saber de un modelo del catálogo (`list_models`). */
export type SurfaceModel = { id: string; gratis?: boolean | null };

/**
 * Si el modelo es de esa mitad del catálogo. Un sufijo `-free` no garantiza
 * gratuidad: el filtro usa el dato del catálogo. Sin superficie, o con una que
 * no parte el catálogo, todo vale.
 *
 * El login de OpenCode es uno solo, el de Go: los modelos que se cobraban
 * contra el saldo de Zen (`opencode/…`) ya no se ofrecen. El motor todavía los
 * publica; la partición los deja fuera aquí.
 */
export function surfaceHas(s: Surface | undefined, m: SurfaceModel): boolean {
  if (s?.id === "danil-credits") {
    return canonicalAgentId(s.provider) === OPENCODE && m.id === "danil-credits/deepseek/deepseek-v4.1-flash" && m.gratis !== true;
  }
  if (m.id.startsWith("danil-credits/")) return false;
  if (s && canonicalAgentId(s.provider) === OPENCODE && s.catalogo !== "gratuitos" && m.id.startsWith("opencode/")) return false;
  if (!s || s.catalogo === "todo") return true;
  return s.catalogo === "gratuitos" ? m.gratis === true && m.id === "danil-free/reflection/beam-free" : m.gratis !== true;
}

/**
 * Lo que el selector de modelo ofrece: lo utilizable, más aquello con lo que
 * corre la tarea abierta. Lo sin autenticar no sale. La superficie de la tarea
 * abierta se queda aunque no sea usable: si desapareciera, el selector caería
 * solo en otra y la tarea seguiría con un agente que no es el suyo, sin que
 * nada lo dijera.
 */
export function menuSurfaces<S extends Surface>(all: readonly S[], current: string | undefined): S[] {
  return all.filter((s) => s.usable || s.id === current);
}

/**
 * Con qué superficie se está trabajando, derivada y nunca guardada: la tarea
 * persiste agente y modelo, y cuál mitad enseñar lo dice el modelo.
 *
 * 1. La que ya estaba, si sigue sirviendo a este agente y a este modelo.
 * 2. La del agente cuyo catálogo contiene el modelo guardado: una tarea de un
 *    modelo gratuito abre en «Modelos gratuitos».
 * 3. La primera usable de ese agente: la tarea sin modelo todavía.
 * 4. La primera de ese agente aunque no sea usable: la tarea viva con un agente
 *    desconectado se enseña en vez de cambiarla de agente sin decirlo.
 */
export function surfaceOf(
  all: readonly Surface[],
  agent: string,
  model: string,
  catalog: readonly SurfaceModel[],
  current: string | undefined,
): string | undefined {
  const own = all.filter((s) => s.provider === agent || canonicalAgentId(s.provider, model) === canonicalAgentId(agent, model));
  if (own.length === 0) return undefined;

  const chosen = catalog.find((m) => m.id === model);
  const serves = (s: Surface) => !chosen || surfaceHas(s, chosen);

  const previous = own.find((s) => s.id === current);
  if (previous && serves(previous)) return previous.id;

  return (
    own.find((s) => s.usable && serves(s))?.id ??
    own.find((s) => serves(s))?.id ??
    own.find((s) => s.usable)?.id ??
    own[0].id
  );
}

/** Lo que la regla del chip lee de una tarea abierta (`load_session`). */
export type ModelSession = {
  model?: string | null;
  observed_model?: string | null;
  parent?: string | null;
  subagent?: unknown;
  turns: readonly { role: string; model?: string | null }[];
};

/**
 * El modelo que se muestra al abrir una tarea: el elegido o, si nadie eligió,
 * el último que se observó contestando. Una subtarea, que no guarda el
 * observado, toma el de su último turno del agente. Solo la que nunca contestó
 * deja el selector vacío para que el CLI use el suyo.
 */
export function chipModel(session: ModelSession): string | null {
  if (session.model) return session.model;
  if (!(session.parent || session.subagent)) return session.observed_model ?? null;
  for (let i = session.turns.length - 1; i >= 0; i--) {
    const turn = session.turns[i];
    if (turn.role === "agent" && turn.model) return turn.model;
  }
  return null;
}
