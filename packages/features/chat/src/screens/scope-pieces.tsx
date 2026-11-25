import FolderOpen from "lucide-solid/icons/folder-open";
import Link from "lucide-solid/icons/link";
import Search from "lucide-solid/icons/search";
import { t } from "../../../../ui/src/lib/i18n";
import { enfocar } from "../../../../ui/src/lib/focus";
import { Pressable } from "../../../../ui/src/Pressable";
import type { createAlcance } from "./scope-state";
import { Input } from "../../../../ui/src/Input";

export function createPiezas(s: ReturnType<typeof createAlcance>) {
  const { busca, setBusca, setPaso, traerCarpeta } = s;

  const vacio = (t: string) => <p class="m-0 px-2 py-2">{t}</p>;

  /** El buscador va **debajo** de la lista: lo que se busca casi siempre está
   *  arriba, y escribir es para cuando no. */
  const buscador = (marcador: string) => (
    <div class="relative border-t border-border">
      <Search
        size={11}
        class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"
        aria-hidden="true"
      />
      <Input
        ref={enfocar}
        variant="picker"
        placeholder={marcador}
        value={busca()}
        onInput={(e) => setBusca(e.currentTarget.value)}
      />
    </div>
  );

  /** Los otros dos caminos, al pie de la navegación por cuenta. */
  const extras = () => (
    <>
      <li>
        <Pressable
          class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left hover:bg-surface-muted hover:text-neutral-950"
          onClick={() => setPaso({ que: "direccion" })}
        >
          <Link size={12} aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">
            {t("chat.scope.paste_url_or_path")}
          </span>
        </Pressable>
      </li>
      <li>
        <Pressable
          class="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left hover:bg-surface-muted hover:text-neutral-950"
          onClick={() => void traerCarpeta()}
        >
          <FolderOpen size={12} aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{t("chat.scope.pick_folder")}</span>
        </Pressable>
      </li>
    </>
  );

  return { vacio, buscador, extras };
}
