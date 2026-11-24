/**
 * Cómo se muestra una ruta de otra máquina. En una Linux remota (la «Nube IA»
 * de una organización) el HOME es `/home/<usuario>`: se abrevia a `~`, que la
 * persona reconoce, en vez del nombre de usuario del servidor.
 */
const HOME = /^\/home\/[^/]+(?=\/|$)/;

/** `/home/<usuario>` → `~` y `/home/<usuario>/x` → `~/x`; cualquier otra ruta, igual. */
export function abbreviateHomePath(path: string): string {
  return path.replace(HOME, "~");
}

/** «Nube IA · ~/Documents/Danil»: la máquina y su ruta abreviada; sin máquina, solo la ruta. */
export function remotePathLabel(path: string, machine?: string | null): string {
  const short = abbreviateHomePath(path);
  const name = machine?.trim();
  return name ? `${name} · ${short}` : short;
}

/** Lo que dice `machine_list` de cada máquina en el workspace abierto. */
export type HostRow = { id: string; local: boolean; hosts: boolean | null };

/**
 * La máquina remota que atiende el workspace abierto cuando esta computadora no
 * lo tiene (p. ej. el de una organización, en su «Nube IA»), o `null`.
 */
export function remoteHost(machines: readonly HostRow[]): string | null {
  if (machines.some((m) => m.local && m.hosts !== false)) return null;
  return machines.find((m) => !m.local && m.hosts === true)?.id ?? null;
}
