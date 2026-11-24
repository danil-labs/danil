import { invoke } from "../../engine-client/src/client";
import { createResource, Show } from "solid-js";
import { imagenInerte } from "./lib/chat/links";
import { EnlargeableImage } from "./EnlargeableImage";
import { FilePreview } from "./FilePreview";
import { useFileMachine } from "./fileMachine";

/** El disco es el de otra computadora (la web, o una tarea remota): su motor manda la imagen como `data:`. */
export default function RemoteImage(props: { path: string; alt?: string }) {
  const enSuMaquina = useFileMachine();
  const [fuente] = createResource(
    () => props.path,
    (ruta) =>
      invoke<{ data_url?: string | null }>("preview_file", { path: ruta, rel: ruta }, enSuMaquina())
        .then((p) => imagenInerte(p.data_url))
        .catch(() => null),
  );
  return (
    <Show
      when={fuente()}
      fallback={
        <Show when={!fuente.loading} fallback={<span class="text-neutral-500">{props.alt}</span>}>
          <FilePreview path={props.path} alt={props.alt} />
        </Show>
      }
    >
      {(src) => <EnlargeableImage src={src()} alt={props.alt} />}
    </Show>
  );
}
