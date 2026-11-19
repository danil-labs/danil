type Group = { family: string; email: string | null; available: readonly unknown[] | null };

/** Los correos sin ningún workspace en el riel (lista vacía o sin fuente, como una organización de pago sin VM): una fila por correo. */
export function emptySessionEmails(groups: readonly Group[] | null): { email: string | null; family: string }[] {
  const key = (g: Group) => g.email?.trim().toLowerCase() || `family:${g.family}`;
  const withWorkspaces = new Set((groups ?? []).filter((g) => g.available?.length).map(key));
  const rows = new Map<string, { email: string | null; family: string }>();
  for (const g of groups ?? []) if (!withWorkspaces.has(key(g)) && !rows.has(key(g))) rows.set(key(g), { email: g.email, family: g.family });
  return [...rows.values()];
}
