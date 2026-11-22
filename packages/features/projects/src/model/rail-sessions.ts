export function createRailSessions(deps: { activeSpace: () => import("../../../../../apps/desktop/src/lib/spaces").Space | null; carpetasDelEscritorio: <P extends { id: string; }>(projects: readonly P[], desk: import("../../../../../apps/desktop/src/lib/spaces").Space | null, sesiones: Record<string, readonly (import("../../../../tasks/src/flat").LauncherRow & { id?: string; space?: string | null; archived?: boolean | null; pinned?: boolean | null; machine?: string | null; })[]>) => P[]; createMemo: { <Next extends Prev, Prev = Next>(fn: import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer<Prev>, Next>): import("solid-js").Accessor<Next>; <Next extends Prev, Init = Next, Prev = Next>(fn: import("solid-js").EffectFunction<Init | Prev, Next>, value: Init, options?: import("solid-js").MemoOptions<Next>): import("solid-js").Accessor<Next>; }; delegatedAttention: (rows: readonly import("../../../../tasks/src/family").AttentionRow[], live: readonly string[], approvals: readonly string[]) => import("../../../../design/src/taskState").TaskActivity; delegatedFamilies: <R extends import("../../../../tasks/src/tree").TaskTreeRow>(rows: readonly R[]) => Map<string, string[]>; enEscritorio: (row: import("../../../../tasks/src/flat").LauncherRow & { id?: string; space?: string | null; archived?: boolean | null; pinned?: boolean | null; machine?: string | null; }, desk: string | null) => boolean; escritorio: import("solid-js").Accessor<string | null>; multipleSpaces: () => boolean; permissions: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/project-block-types.ts").PermissionRequest[]>; projectList: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Project[]>; remoteChildScope: () => import("../../../../tasks/src/remote").RemoteScope; sesiones: import("solid-js").Accessor<Record<string, import("../screens/Sessions").SessionRow[]>>; sesionesConEstado: () => { [k: string]: import("../screens/Sessions").SessionRow[]; }; spaceName: (i: { name: string | null; } | null | undefined) => string; spaces: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/spaces").Space[]>; vivas: import("solid-js").Accessor<string[]>; withRemoteLaunchers: <R extends import("../../../../tasks/src/remote").RemoteRow>(rows: readonly R[], scope: import("../../../../tasks/src/remote").RemoteScope) => R[] } & { _bridge: Record<string, any> }) {
  const _bridge = deps._bridge;
  const { activeSpace, carpetasDelEscritorio, createMemo, delegatedAttention, delegatedFamilies, enEscritorio, escritorio, multipleSpaces, permissions, projectList, remoteChildScope, sesiones, sesionesConEstado, spaceName, spaces, vivas, withRemoteLaunchers } = deps;
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
  const _out = { proyectosDelRiel, sesionesDelRiel, opcionesDeMover };
  Object.assign(_bridge, _out);
  return _out;
}
