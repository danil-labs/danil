import { createSignal } from "solid-js";
import type { InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "./invoke.ts";
import { prosa, type Frase } from "./prose.ts";
import { t } from "./i18n.ts";

/**
 * Los servicios de código salen del motor y de ningún otro sitio. Una pantalla
 * que escribe su propia lista deja fuera al que el motor agregue después.
 */

/** Cómo nombra cada servicio lo que propone integrar. Espeja `git_hosts::Vocabulary`. */
export type GitHostVocabulary = {
  change: Frase;
  change_short: Frase;
  change_prefix: string;
  checks: Frase;
};

/** Lo que todo servicio declara de sí. Cada pantalla lo extiende con lo que lee. Espeja `git_hosts::GitHostInfo`. */
export type GitHost = {
  id: string;
  name: string;
  summary: Frase;
  vocabulary: GitHostVocabulary;
  connected: unknown | null;
};

const [known, setKnown] = createSignal<Record<string, GitHost>>({});
let requested = false;

export async function listGitHosts<T extends GitHost = GitHost>(scope?: string, options?: InvokeOptions): Promise<T[]> {
  const hosts = await invoke<T[]>("list_git_hosts", scope === undefined ? undefined : { scope }, options);
  setKnown(Object.fromEntries(hosts.map((h) => [h.id, h])));
  return hosts;
}

function vocabularyOf(id: string | undefined): GitHostVocabulary | undefined {
  if (!requested && Object.keys(known()).length === 0) {
    requested = true;
    void listGitHosts().catch(() => { requested = false; });
  }
  return id ? known()[id]?.vocabulary : undefined;
}

/** `#12` o `!12`. Sin servicio conocido, el de los dos que llegaron primero. */
export function changeNumber(gitHost: string | undefined, n: number): string {
  return `${vocabularyOf(gitHost)?.change_prefix ?? "#"}${n}`;
}

/** «PR» o «MR». */
export function changeShort(gitHost: string | undefined): string {
  const v = vocabularyOf(gitHost);
  return v ? prosa(v.change_short) : t("projects.git.change_short_default");
}

/** «Comprobaciones» o «Pipeline». */
export function checksName(gitHost: string | undefined): string {
  const v = vocabularyOf(gitHost);
  return v ? prosa(v.checks) : t("projects.git.checks_default");
}
