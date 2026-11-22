const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Cada palabra de la búsqueda aparece en algún campo, sin importar acentos, mayúsculas ni orden. */
export function matchesTaskQuery(fields: (string | null | undefined)[], query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = fields.map((field) => fold(field ?? "")).join("\n");
  return terms.every((term) => haystack.includes(term));
}
