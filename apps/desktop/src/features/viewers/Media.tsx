import { readTreeFile, type TreePart } from "@terminus/protocol";
import { Show, createResource, createSignal, onCleanup } from "solid-js";
import { t } from "../../lib/i18n";
import { capabilities } from "../../lib/platform";
import { peso } from "../../lib/format";
import { FailureNote, asFailure } from "../../ui/Failure";

/** Lo que se lee del árbol de la tarea, una parte cada vez (`tree_read_part`). */
export type LeerParte = (offset: number, size: number, revision?: string) => Promise<TreePart>;

/**
 * Un `blob:` en la web, que es lo que Safari reproduce, y un `data:` en la
 * ventana, cuya política solo deja ese (`index.html`, `media-src`).
 */
export async function urlDeArchivo(leer: LeerParte, onProgress?: (hecho: number, total: number) => void): Promise<{ url: string; liberar: () => void }> {
  const { bytes, mime } = await readTreeFile(leer, { onProgress });
  if (!capabilities().nativeWindow) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    return { url, liberar: () => URL.revokeObjectURL(url) };
  }
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { url: `data:${mime};base64,${btoa(binario)}`, liberar: () => {} };
}

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

/** Lo baja al equipo de quien mira: en la web, «Abrir afuera» abriría el archivo en la otra máquina. */
export async function descargar(nombre: string, leer: LeerParte) {
  const { bytes, mime } = await readTreeFile(leer);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre.slice(nombre.lastIndexOf("/") + 1);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
