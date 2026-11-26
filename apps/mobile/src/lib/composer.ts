import type { PermissionModeOption, ProviderInfo } from "@terminus/protocol";
import {
  canonicalAgentId,
  DANIL_CREDITS_CLAUDE_SURFACE,
  DANIL_CREDITS_MODEL,
  defaultSurfaceModel,
  FREE_ROUTER_MODEL,
  isDanilCreditsSurface,
  isFreeRouterAgent,
  type Surface,
  surfaceHas,
  type SurfaceModel,
} from "@terminus/tasks";

/**
 * Qué hace una tecla en el cuadro de la web del teléfono, con la regla del
 * escritorio (`Chat.tsx`): Enter manda; Shift+Enter hace salto de línea. Mientras
 * el teclado compone un carácter (IME), Enter lo confirma y no manda: el
 * navegador lo marca con `isComposing` o, en Safari, con `keyCode` 229.
 */
export function enterAction(e: { key: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number }): "send" | "newline" | null {
  if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return null;
  return e.shiftKey ? "newline" : "send";
}

/**
 * Si el cuadro tiene algo que mandar: texto o un adjunto ya subido. Un `!` solo
 * no es un comando.
 */
export function hasSomethingToSend(text: string, uploaded: number): boolean {
  const body = text.trim();
  if (body.startsWith("!")) return Boolean(body.slice(1).trim());
  return Boolean(body) || uploaded > 0;
}

/**
 * El modo con que arranca el cuadro, como `modoInicial` del escritorio:
 * `preferred` (el que guarda la tarea, o el del workspace) si este proveedor lo
 * sostiene; si no, el que resolvió el motor (`por_omision`), y si no, el primero
 * que se pueda usar. `null` mientras no llega la lista.
 */
export function initialMode(modes: readonly PermissionModeOption[], preferred: string | null): string | null {
  const usable = modes.filter((m) => !m.falta);
  return (
    usable.find((m) => m.id === preferred) ??
    usable.find((m) => m.por_omision) ??
    usable.find((m) => m.id === AUTO_MODE) ??
    usable[0]
  )?.id ?? null;
}

/** El id de `agents::Modo::Auto`: el motor lo sostiene con todo proveedor. */
export const AUTO_MODE = "auto";

/**
 * De dónde arranca el cuadro: `saved`, el modo que guarda la tarea abierta;
 * `workspace`, el que eligió el workspace para las tareas nuevas.
 */
export type ModeStart = { saved?: string | null; workspace?: string | null };

/**
 * El modo que se ve y se manda: el que eligió la persona si este proveedor lo
 * sostiene, y si no, el inicial (el de la tarea, el del workspace o el del
 * proveedor). Sin lista (la máquina apagada que nunca la dio) va el de la
 * tarea, que el motor baja si hace falta por ser heredado, o `auto`, que todo
 * proveedor sostiene: otro modo que el proveedor no sostenga el motor lo niega
 * (`agents::Permisos::for_turn`), y `null` corre el suyo por omisión.
 */
export function effectiveMode(modes: readonly PermissionModeOption[], chosen: string | null, start: ModeStart): string | null {
  if (!modes.length) return start.saved || (start.workspace === AUTO_MODE ? AUTO_MODE : null);
  if (chosen && modes.some((m) => m.id === chosen && !m.falta)) return chosen;
  const usable = modes.filter((m) => !m.falta);
  if (start.saved && usable.some((m) => m.id === start.saved)) return start.saved;
  return initialMode(modes, start.workspace ?? null);
}

/**
 * Qué proveedor usa el cuadro cuando aún no se eligió uno explícito:
 * 1. El que ya tiene la tarea o eligió la persona (`explicit`).
 * 2. El proveedor de la primera superficie utilizable (`list_surfaces`, que
 *    incluye Danil Credits y el Router gratuito además de las cuentas personales).
 * 3. El primer CLI instalado (`available && driver`) como respaldo cuando el
 *    motor aún no entrega superficies.
 */
export function resolveProvider(
  explicit: string | null,
  providers: readonly Pick<ProviderInfo, "id" | "available" | "driver">[],
  surfaces: readonly Pick<Surface, "id" | "provider" | "usable">[],
): string | null {
  if (explicit) return explicit;
  const fromSurface = surfaces.find((s) => s.usable)?.provider;
  if (fromSurface) return fromSurface;
  return providers.find((p) => p.available && p.driver)?.id ?? null;
}

/**
 * Superficie utilizable de Danil Credits disponible en la máquina, aunque el
 * proveedor actualmente seleccionado sea otro (por ejemplo `codex` sin sesión).
 * Prefiere la del proveedor actual y, si no, la de Claude sobre la histórica.
 */
export function creditsSurfaceOf<S extends Pick<Surface, "id" | "provider" | "usable">>(
  surfaces: readonly S[],
  currentProvider: string | null,
): S | undefined {
  const usable = surfaces.filter((s) => s.usable && isDanilCreditsSurface(s.id));
  return (
    usable.find((s) => s.provider === currentProvider) ??
    usable.find((s) => s.id === DANIL_CREDITS_CLAUDE_SURFACE) ??
    usable[0]
  );
}

const isRouterSurfaceLike = (s: Pick<Surface, "provider" | "catalogo">) =>
  s.catalogo === "gratuitos" && isFreeRouterAgent(canonicalAgentId(s.provider, FREE_ROUTER_MODEL));

/**
 * El modelo que realmente viaja para `surface`:
 * - Mantiene `model` si sigue perteneciendo a la superficie activa.
 * - En Danil Credits o Free Router, completa su modelo canónico (`Equilibrado` o
 *   la ruta gratuita) incluso antes de que termine de cargar el catálogo, para
 *   no mandar `model: null` y caer en una cuenta personal inexistente.
 * - En una superficie normal, si el modelo anterior era de otra superficie
 *   (por ejemplo al cambiar desde Credits o Free Router), elige el predeterminado
 *   de la superficie o `null` para que el CLI use el suyo.
 */
export function resolveSurfaceModel<M extends SurfaceModel>(
  surface: Surface | undefined,
  model: string | null,
  models: readonly M[],
): string | null {
  if (!surface) return model;
  const surfaceModels = models.filter((m) => surfaceHas(surface, m));
  if (model) {
    const known =
      models.find((m) => m.id === model) ??
      { id: model, gratis: model === FREE_ROUTER_MODEL ? true : undefined };
    if (surfaceHas(surface, known)) return model;
  }
  if (isDanilCreditsSurface(surface.id)) {
    return defaultSurfaceModel(surface, surfaceModels)?.id ?? DANIL_CREDITS_MODEL;
  }
  if (isRouterSurfaceLike(surface)) {
    return defaultSurfaceModel(surface, surfaceModels)?.id ?? FREE_ROUTER_MODEL;
  }
  return model ? (defaultSurfaceModel(surface, surfaceModels)?.id ?? null) : null;
}
