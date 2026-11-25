import { Show, createResource, createSignal, onCleanup } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { peso } from "../../../../ui/src/lib/format";
import { FailureNote, asFailure } from "../../../../ui/src/Failure";
import { descargar, type LeerParte } from "../../../../host/src/tree-download";
import { urlDeArchivo } from "../queries/media";

export { descargar, type LeerParte };
export { urlDeArchivo };

/**
 * Un video o un audio de la tarea: baja por partes con su avance y se reproduce
 * con el reproductor del navegador. Nada se descarga hasta abrir el archivo.
 */
export default function Reproductor(props: { ruta: string; tipo: "video" | "audio"; leer: LeerParte }) {
  const [avance, setAvance] = createSignal<{ hecho: number; total: number } | null>(null);
  let liberar = () => {};
  onCleanup(() => liberar());
  const [medio] = createResource(
    () => props.ruta,
    async () => {
      liberar();
      setAvance(null);
      const r = await urlDeArchivo(props.leer, (hecho, total) => setAvance({ hecho, total }));
      liberar = r.liberar;
      return r.url;
    },
  );
  const fallo = () => {
    const e = medio.error;
    if (!e) return null;
    return e && typeof e === "object" && "detail" in e && e.detail === "tree_file_too_large" ? "grande" : "otro";
  };
  return (
    <div class={props.tipo === "video" ? "flex h-full min-h-0 items-center justify-center bg-black" : "flex h-full min-h-0 items-center justify-center p-6"}>
      <Show
        when={medio()}
        fallback={
          <Show
            when={fallo()}
            fallback={
              <div class="flex w-64 max-w-full flex-col items-center gap-2 text-xs text-neutral-500">
                <span>{t("code.file.media.loading")}</span>
                <div class="h-1 w-full overflow-hidden rounded-full bg-neutral-500/30">
                  <div
                    class="h-full bg-primary transition-[width]"
                    style={{ width: `${avance() ? Math.round((avance()!.hecho / Math.max(1, avance()!.total)) * 100) : 0}%` }}
                  />
                </div>
                <Show when={avance()}>{(a) => <span class="font-mono tabular-nums">{peso(a().hecho)} / {peso(a().total)}</span>}</Show>
              </div>
            }
          >
            {(f) => (
              <div class="flex max-w-sm flex-col items-center gap-2 p-6 text-center text-xs text-neutral-500">
                <p class="m-0">{f() === "grande" ? t("code.file.media.too_big") : t("code.file.media.failed")}</p>
                <Show when={f() === "otro"}>
                  <FailureNote f={asFailure(medio.error)} />
                </Show>
              </div>
            )}
          </Show>
        }
      >
        {(url) =>
          props.tipo === "video" ? (
            <video src={url()} controls playsinline preload="metadata" class="max-h-full max-w-full" aria-label={props.ruta} />
          ) : (
            <audio src={url()} controls preload="metadata" class="w-full max-w-lg" aria-label={props.ruta} />
          )
        }
      </Show>
    </div>
  );
}
