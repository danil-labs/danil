import { For, Show, createEffect, createSignal } from "solid-js";
import { memoryDirs, memoryHistory, type MemoryVersion, parseMemoryEntry, readMemoryFile } from "@terminus/computers";
import { Button } from "../../../../ui/src/Button";
import { Dialog, DialogContent, DialogTitle } from "../../../../ui/src/Dialog";
import { FailureNote, type Failure } from "../../../../ui/src/Failure";
import { manifiesto, t } from "../../../../../apps/desktop/src/lib/i18n";
import type { MemoriaScope } from "../../../../../apps/desktop/src/lib/model";
import type { MemoriaDeCuenta } from "../queries/memory-account";

const fecha = (iso: string) =>
  iso
    ? new Intl.DateTimeFormat(manifiesto().formato, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
    : "";

/**
 * Las versiones de una entrada en la cuenta de Danil, de la más nueva a la más
 * vieja, con quién y cuándo; «Ver» abre el texto de esa versión. Se lee del
 * Worker (`GET …/memory/history` y `…/memory/file?ref=`): funciona con las
 * máquinas apagadas. `path` es la ruta en el repo si ya se sabe (la web);
 * si no (la ventana), se prueban las carpetas del alcance.
 */
export default function HistorialDeEntrada(props: {
  cuenta: MemoriaDeCuenta | null;
  project: string;
  scope: MemoriaScope;
  file: string | null;
  path?: string | null;
  onCerrar: () => void;
}) {
  const [versiones, setVersiones] = createSignal<MemoryVersion[] | null>(null);
  const [ruta, setRuta] = createSignal<string | null>(null);
  const [vista, setVista] = createSignal<{ commit: string; texto: string } | null>(null);
  const [fallo, setFallo] = createSignal<Failure | null>(null);

  createEffect(() => {
    const file = props.file;
    const cuenta = props.cuenta;
    setVersiones(null);
    setVista(null);
    setFallo(null);
    if (!file || !cuenta) return;
    void (async () => {
      const candidatas = props.path ? [props.path] : memoryDirs(props.project, props.scope).map((d) => `${d}${file}`);
      for (const path of candidatas) {
        const answer = await memoryHistory(cuenta.source, cuenta.workspace, path);
        if (props.file !== file) return;
        if (answer.kind !== "ok") {
          setFallo({ what: t("projects.memory.history_error"), detail: answer.kind });
          setVersiones([]);
          return;
        }
        if (answer.value.length > 0 || path === candidatas.at(-1)) {
          setRuta(path);
          setVersiones(answer.value);
          return;
        }
      }
    })();
  });

  async function ver(v: MemoryVersion) {
    const cuenta = props.cuenta;
    const path = ruta();
    if (!cuenta || !path || !v.oid) return;
    const answer = await readMemoryFile(cuenta.source, cuenta.workspace, path, v.commit);
    if (answer.kind !== "ok") {
      setFallo({ what: t("projects.memory.history_error"), detail: answer.kind });
      return;
    }
    setVista({ commit: v.commit, texto: parseMemoryEntry(answer.value.content).body.trim() });
  }

  return (
    <Dialog open={props.file !== null} onOpenChange={(a) => !a && props.onCerrar()}>
      <DialogContent>
        <DialogTitle class="m-0 text-lead font-semibold">
          {t("projects.memory.history_title", { file: props.file ?? "" })}
        </DialogTitle>
        <div class="grid gap-2 pt-3" data-memory-history="">
          <Show when={fallo()}>{(f) => <FailureNote f={f()} />}</Show>
          <Show when={versiones()} fallback={<p class="m-0 text-ui text-neutral-500">{t("projects.memory.history_loading")}</p>}>
            {(lista) => (
              <Show
                when={lista().length > 0}
                fallback={<p class="m-0 text-ui text-neutral-500">{t("projects.memory.history_empty")}</p>}
              >
                <ol class="m-0 grid list-none gap-1.5 p-0">
                  <For each={lista()}>
                    {(v, i) => (
                      <li class="grid gap-1 rounded-md border border-border px-3 py-2" data-memory-version={v.commit}>
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-neutral-500">
                          <span class="text-neutral-950">{v.author.name || v.author.email}</span>
                          <span>{fecha(v.at)}</span>
                          <Show when={i() === 0}>
                            <span>{t("projects.memory.history_current")}</span>
                          </Show>
                          <span class="font-mono">{v.commit.slice(0, 7)}</span>
                        </div>
                        <p class="m-0 text-label text-neutral-700">{v.message}</p>
                        <Show
                          when={v.oid}
                          fallback={<span class="text-label text-neutral-500">{t("projects.memory.history_deleted")}</span>}
                        >
                          <div>
                            <Button variant="ghost" size="compact" onClick={() => void ver(v)}>
                              {t("projects.memory.history_view")}
                            </Button>
                          </div>
                        </Show>
                        <Show when={vista()?.commit === v.commit}>
                          <pre class="m-0 max-h-64 overflow-auto rounded bg-neutral-50 p-2 text-label whitespace-pre-wrap" data-memory-version-text="">
                            {vista()?.texto}
                          </pre>
                        </Show>
                      </li>
                    )}
                  </For>
                </ol>
              </Show>
            )}
          </Show>
          <div class="flex justify-end">
            <Button variant="ghost" size="sm" onClick={props.onCerrar}>
              {t("projects.memory.history_close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
