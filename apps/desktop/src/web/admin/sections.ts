/** Qué ve cada cuenta en `/admin`: reglas por plan y rol, y el menú por tarea. */
export type AccountKind = "personal" | "teams" | "enterprise";
export type Section = "general" | "harness" | "usage" | "members" | "support" | "audit" | "skills" | "mcp" | "agents" | "rules" | "workspaces" | "plan" | "identity";
export type GroupName = "summary" | "people" | "control" | "organization";

/**
 * Solo un dato explícito hace personal a una cuenta: el plan Personal o `personal` (el BFF dijo que no tiene organización).
 * Si el BFF no manda ninguno, tratarla así dejaría sin Harness a una organización.
 */
export function accountKind(account: { plan: string | null; personal?: boolean }): AccountKind {
  const plan = account.plan?.toLowerCase() ?? "";
  if (plan.includes("enterprise")) return "enterprise";
  if (plan.includes("personal") || account.personal === true) return "personal";
  return "teams";
}

/** El Harness es de organizaciones: lo de una cuenta personal vive en Configuración. */
const BY_KIND: Record<AccountKind, readonly Section[]> = {
  personal: [],
  teams: ["general", "harness", "usage", "members", "support", "audit", "skills", "mcp", "agents", "rules", "workspaces", "plan"],
  enterprise: ["general", "harness", "usage", "members", "support", "audit", "skills", "mcp", "agents", "rules", "workspaces", "plan", "identity"],
};

/** Un miembro solo lee: su consumo y lo que rige su trabajo. */
const FOR_MEMBERS: readonly Section[] = ["harness", "usage", "rules", "skills", "mcp", "agents"];

/** Lo que esta cuenta puede abrir: `available` son las secciones con fuente de datos, así nada sin backend aparece. */
export function visibleSections(kind: AccountKind, manager: boolean, available: ReadonlySet<Section>): Section[] {
  return BY_KIND[kind].filter((section) => available.has(section) && (manager || FOR_MEMBERS.includes(section)));
}

const MENU: { group: GroupName; sections: Section[] }[] = [
  { group: "summary", sections: ["general", "harness", "usage", "audit"] },
  { group: "people", sections: ["members", "support"] },
  { group: "control", sections: ["rules", "skills", "mcp", "agents"] },
  { group: "organization", sections: ["workspaces", "plan", "identity"] },
];

/** El menú sin lo que la cuenta no ve; un grupo vacío no sale. */
export function menuFor(visible: readonly Section[]) {
  return MENU.flatMap((entry) => {
    const sections = entry.sections.filter((section) => visible.includes(section));
    return sections.length ? [{ group: entry.group, sections }] : [];
  });
}
