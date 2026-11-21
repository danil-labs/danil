import { Match, Switch } from "solid-js";
import Folder from "lucide-solid/icons/folder";
import GitBranch from "lucide-solid/icons/git-branch";
import { BitbucketMark, GitHubMark } from "./icons";

/**
 * Cómo se pinta una fuente de contexto, en un solo sitio.
 *
 * Lo piden Configuración —la lista de material— y la caja del chat —el chip de
 * lo adjunto—. Dos copias de esto se separan en el primer proveedor que se
 * añada, y entonces el mismo repo se vería distinto según dónde se mire.
 */

/**
 * La marca de dónde salió el material: GitHub, Bitbucket, un repo cualquiera o
 * una carpeta de esta computadora.
 *
 * **Se deduce de la dirección y no de un campo**, porque no hay tal campo: una
 * fuente guarda de dónde se trajo, y el proveedor está ahí escrito. Un campo
 * aparte sería el mismo dato dos veces, y el día que se desincronicen gana el
 * equivocado.
 */
export function MarcaFuente(props: { location: string; kind: string }) {
  const dir = () => props.location.toLowerCase();

  return (
    <Switch
      fallback={<Folder size={12} class="shrink-0 text-neutral-500" />}
    >
      <Match when={props.kind === "git" && dir().includes("github.com")}>
        <GitHubMark size={12} />
      </Match>
      <Match when={props.kind === "git" && dir().includes("bitbucket.org")}>
        <BitbucketMark size={12} />
      </Match>
      <Match when={props.kind === "git"}>
        <GitBranch size={12} class="shrink-0 text-neutral-500" />
      </Match>
    </Switch>
  );
}

/** `org/repo` de una dirección de clonado. Lo que identifica al repo, sin el
 *  host ni el `.git`, que son ruido en una lista. */
export function repoDe(url: string): string | null {
  const m = /[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? m[1] : null;
}
