import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { Provider } from "./ProvidersModel";
import type { createProveedores } from "./ProvidersState";

export function createFilaDeProveedor(p: Provider, proveedores: ReturnType<typeof createProveedores>) {
  const { ocupado, fallas, borradorDe, areas, choosing, abierta, esperas } = proveedores;
  const estado = () => ocupado()[p.id] ?? null;
  const falla = () => fallas()[p.id];
  const b = () => borradorDe(p.id);
  const misAreas = () => areas()[p.id];
  // Se compone aquí y no en el `when`: el compilador reescribe el
  // lado izquierdo de un `&&` como `!!a` para memoizarlo, y cuando
  // es falsy lo que viaja es `false`, no el valor. Un accesor
  // derivado conserva el tipo. Ver `SYSTEM.md` § Las reglas de
  // Solid, regla 7 bis.
  const mostrarAreas = () => !p.select_area || choosing()[p.id];
  const areasVisibles = () =>
    estado() === "listando" || !mostrarAreas() ? null : misAreas();
  const abiertaAqui = () => abierta()[p.id];
  const esperaAqui = () => esperas()[p.id];
  // Un control deshabilitado dice por qué lo está. Mientras hay una
  // consulta en curso todos estos botones se bloquean, y sin esto
  // quedan muertos y mudos, que se lee como que la app se rompió.
  const espera = () =>
    estado() === "comprobando"
      ? t("settings.providers.busy_checking", { name: p.name })
      : estado() === "listando"
        ? t("settings.providers.busy_listing", { name: p.name })
        : undefined;
  const elegidas = () => {
    const c = p.connected;
    if (!c) return [];
    if (c.selected_areas?.length) return c.selected_areas;
    return c.selected_area ? [c.selected_area] : [];
  };
  return { esperaAqui, estado, espera, elegidas, b, falla, mostrarAreas, areasVisibles, abiertaAqui };
}
