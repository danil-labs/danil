import { createMemo, type Accessor } from "solid-js";
import { carpetasDelEscritorio, enEscritorio, spaceName, type Space } from "../../../../../apps/desktop/src/lib/spaces.ts";
import { delegatedAttention, delegatedFamilies } from "../../../../tasks/src/family.ts";
import { withRemoteLaunchers, type RemoteScope } from "../../../../tasks/src/remote.ts";
import type { Project } from "../../../../../apps/desktop/src/lib/model.ts";
import type { PermissionRequest } from "../../../../../apps/desktop/src/lib/project-block-types.ts";
import type { SessionRow } from "../screens/Sessions.tsx";

export type RailSessionsDeps = {
  activeSpace: Accessor<Space | null>;
  escritorio: Accessor<string | null>;
  multipleSpaces: () => boolean;
  permissions: Accessor<PermissionRequest[]>;
  projectList: Accessor<Project[]>;
  remoteChildScope: () => RemoteScope;
  sesiones: Accessor<Record<string, SessionRow[]>>;
  sesionesConEstado: () => Record<string, SessionRow[]>;
  spaces: Accessor<Space[]>;
  vivas: Accessor<string[]>;
};

export function createRailSessions(deps: RailSessionsDeps) {
  const { activeSpace, escritorio, multipleSpaces, permissions, projectList, remoteChildScope, sesiones, sesionesConEstado, spaces, vivas } = deps;
  // El riel del escritorio activo. Sin escritorio es el de siempre.
  const proyectosDelRiel = createMemo(() => carpetasDelEscritorio(projectList(), activeSpace(), sesiones()));
  const delegationFamilies = createMemo(() => delegatedFamilies(withRemoteLaunchers(Object.values(sesiones()).flat(), remoteChildScope())));
  const sesionesDelRiel = () => {
    const current = sesionesConEstado();
    const all = Object.values(current).flat();
    const approvals = permissions().map(item => item.session);
    const known = new Map(all.map(row => [row.id, row]));
    const families = delegationFamilies();
    const todas = Object.fromEntries(Object.entries(current).map(([folder, rows]) => [folder, rows.map(row => {
      const children = (families.get(row.id) ?? []).flatMap(id => known.get(id) ?? []);
      return children.length ? { ...row,
        delegated_activity: delegatedAttention([row, ...children], vivas(), approvals) } : row;
    })]));
    const desk = escritorio();
    if (!desk) return todas;
    return Object.fromEntries(Object.entries(todas).map(([k, filas]) => [k, filas.filter((r) => enEscritorio(r, desk))]));
  };
  const opcionesDeMover = () =>
    multipleSpaces() ? spaces().map((i) => ({ id: i.id, name: spaceName(i) })) : [];
  return { proyectosDelRiel, sesionesDelRiel, opcionesDeMover };
}
