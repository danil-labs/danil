/**
 * Una skill que el agente puede cargar: las que la proyección pone en su
 * carpeta y las que su CLI publica como suyas. La `description` falta cuando
 * solo se sabe el nombre. Vive aquí porque el menú es uno para `@` y `/`.
 */
export type Skill = {
  name: string;
  description: string | null;
};

/**
 * Las skills que propone una barra, por el nombre y nunca por la descripción.
 * `mcp-builder` describe «Model Context Protocol»: buscando en la descripción,
 * `/model` y `/context` la proponen y se llevan el resaltado del menú.
 */
export function matchingSkills(skills: Skill[], query: string): Skill[] {
  return skills.filter((s) => s.name.toLowerCase().includes(query));
}

/**
 * Un comando de barra que el CLI resuelve. La `description` la trae ACP; el
 * `system/init` de Claude publica solo nombres (`agents::Comandos`).
 */
export type CliCommand = {
  name: string;
  description: string | null;
};

/**
 * Lo que `list_slash_menu` contesta: los comandos del CLI y las skills, ya
 * separados, y el comando que el agente contesta al margen si declara uno.
 */
export type SlashMenu = { commands: CliCommand[]; skills: Skill[]; side_question?: string | null };

/**
 * Los comandos sin los que ya son skill. Rust ya los separa; una fila repetida
 * enseñaría la misma skill en los dos grupos del menú.
 */
export function cliCommands(skills: Skill[], commands: CliCommand[]): CliCommand[] {
  const skillNames = new Set(skills.map((s) => s.name.toLowerCase()));
  return commands.filter((c) => !skillNames.has(c.name.toLowerCase()));
}

export type SlashSuggestion = { name: string; description: string | null };

/** `agent`: los comandos del CLI de la caja. `skills`: lo que el agente carga. */
export type SlashGroup = { kind: "agent" | "skills"; rows: SlashSuggestion[] };

/**
 * El menú de la barra: el grupo del agente y después el de skills, cada uno
 * por exacto, luego prefijo, luego contiene. Un grupo sin filas no sale.
 */
export function slashSuggestions(skills: Skill[], commands: CliCommand[], query: string): SlashGroup[] {
  const rank = (name: string) => {
    const lower = name.toLowerCase();
    return lower === query ? 0 : lower.startsWith(query) ? 1 : 2;
  };
  const ordered = (rows: SlashSuggestion[]) =>
    rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => rank(a.row.name) - rank(b.row.name) || a.index - b.index)
      .map(({ row }) => ({ name: row.name, description: row.description || null }));
  const groups: SlashGroup[] = [
    {
      kind: "agent",
      rows: ordered(cliCommands(skills, commands).filter((c) => c.name.toLowerCase().includes(query))),
    },
    { kind: "skills", rows: ordered(matchingSkills(skills, query)) },
  ];
  return groups.filter((g) => g.rows.length > 0);
}

/** Las filas en el orden en que se ven: es el que recorren las flechas. */
export function slashRows(groups: SlashGroup[]): (SlashSuggestion & { kind: SlashGroup["kind"] })[] {
  return groups.flatMap((g) => g.rows.map((row) => ({ ...row, kind: g.kind })));
}

/**
 * La fila que empieza resaltada: la del nombre escrito entero, o la primera.
 * Sin esto Tab cambia una skill escrita entera por el comando que la precede.
 */
export function slashPick(groups: SlashGroup[], query: string): number {
  const exact = slashRows(groups).findIndex((r) => r.name.toLowerCase() === query);
  return Math.max(exact, 0);
}
