import { type GitHost } from "../../../../session/src/gitHosts";

/**
 * Traer material al workspace desde **una carpeta local, una cuenta conectada
 * o una dirección de repositorio**.
 *
 * **Los tres orígenes viven en el mismo selector** porque son la misma intención
 * —«quiero que esta tarea lea esto»— con tres formas de llegar: partirlas en
 * selectores hermanos obliga a distinguir controles antes de poder elegir el
 * origen. Solo el adaptador git abre la elección de rama.
 *
 * El campo de pegar **acepta público y privado sin preguntar cuál es**, porque
 * quien pega no tiene por qué saberlo: el backend mira el host y usa el token si
 * hay conexión con ese proveedor (`context::add_repo_url`).
 *
 * **El buscador es un `Input` y una lista filtrada, no un `Command`.** El de
 * shadcn depende de `cmdk`, que no es dependencia del proyecto, y lo que aporta
 * son atajos de teclado sobre una lista que ya se navega con tabulador — la
 * misma cuenta que `ui/icons.tsx` ya hizo.
 *
 * **Los estados excluyentes son un `Switch`** y cada rama nombra su condición:
 * eligiendo rama, cargando proveedores, sin ninguno conectado, eligiendo
 * proveedor, eligiendo organización, o la lista de repos.
 */

export type Proveedor = GitHost;

export type Area = { key: string; name: string };

export type RepoRemoto = {
  slug: string;
  name: string;
  clone_url: string;
  branch: string;
  /**
   * Si esta conexión puede escribir en el repositorio.
   *
   * **`null` es «no lo sé», no «no puedes».** No todos los proveedores lo
   * publican en el listado, y marcar como de solo lectura lo que no se sabe le
   * diría a alguien con escritura que no la tiene. Espeja
   * `git_hosts::RemoteRepo::can_push`.
   */
  can_push: boolean | null;
};

export type RamasRemotas = { default: string; branches: string[] };

export type ObjetivoRamas = {
  cloneUrl: string;
  provider?: string;
  defaultBranch?: string;
  name: string;
};
