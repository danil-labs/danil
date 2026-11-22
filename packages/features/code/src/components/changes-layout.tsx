import Columns2 from "lucide-solid/icons/columns-2";
import Rows2 from "lucide-solid/icons/rows-2";
import type { JSX } from "solid-js";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { createPref } from "../../../../../apps/desktop/src/lib/prefs";
import { Button } from "../../../../ui/src/Button";

type Disposicion = "unified" | "split";

const [disposicionGuardada, setDisposicion] = createPref<Disposicion>("diff.layout", "unified");
const disposicion = (): Disposicion => (disposicionGuardada() === "split" ? "split" : "unified");

/** `delivery/development/` · `Cambios`. */
export type Cambios = {
  base: string;
  files: { path: string; added: number; removed: number; status: string }[];
  added: number;
  removed: number;
  patch: string;
  truncated: boolean;
  warnings: string[];
};

export function SelectorDeDisposicion() {
  return (
    <div role="group" aria-label={t("code.diff.layout.label")} class="flex shrink-0 gap-0.5">
      <BotonDeDisposicion
        pulsado={disposicion() === "unified"}
        etiqueta={t("code.diff.layout.unified")}
        onClick={() => setDisposicion("unified")}
      >
        <Rows2 size={13} />
      </BotonDeDisposicion>
      <BotonDeDisposicion
        pulsado={disposicion() === "split"}
        etiqueta={t("code.diff.layout.split")}
        onClick={() => setDisposicion("split")}
      >
        <Columns2 size={13} />
      </BotonDeDisposicion>
    </div>
  );
}

function BotonDeDisposicion(props: {
  pulsado: boolean;
  etiqueta: string;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <Button
      variant={props.pulsado ? "secondary" : "ghost"}
      size="compact"
      class={cn("size-6 px-0", !props.pulsado && "text-neutral-500 hover:text-neutral-950")}
      aria-pressed={props.pulsado}
      aria-label={props.etiqueta}
      title={props.etiqueta}
      onClick={() => props.onClick()}
    >
      {props.children}
    </Button>
  );
}

export { disposicion };
