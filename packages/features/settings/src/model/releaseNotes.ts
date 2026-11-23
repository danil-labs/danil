/**
 * La nota de la versión en el idioma de la app, de `notes_by_locale` en
 * `rawJson`. Sin nota en ese idioma cae a `body`, que siempre existe.
 */
export function releaseNotes(
  update: { body?: string; rawJson: Record<string, unknown> },
  lengua: string,
): string {
  const porIdioma = update.rawJson.notes_by_locale;
  if (porIdioma && typeof porIdioma === "object") {
    const notas = porIdioma as Record<string, unknown>;
    // `es-MX` → `es`: las notas se publican por idioma, no por región.
    for (const clave of [lengua, lengua.split("-")[0]]) {
      const nota = notas[clave];
      if (typeof nota === "string" && nota.trim()) return nota;
    }
  }
  return update.body ?? "";
}
