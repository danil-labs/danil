/** Sólo la ruta Beam aprobada tiene atribución comprobada; no se deduce del gateway. */
export function modelPresentation(id: string, label?: string | null): { label: string; creator: string | null } {
  if (id === "danil-free/reflection/beam-free" || id === "reflection/beam-free") {
    return { label: "Beam", creator: "Reflection" };
  }
  return { label: label || id, creator: null };
}
