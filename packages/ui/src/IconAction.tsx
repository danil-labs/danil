import Trash2 from "lucide-solid/icons/trash-2";
import Unlink from "lucide-solid/icons/unlink";
import X from "lucide-solid/icons/x";
import { cn } from "../../../apps/desktop/src/lib/utils";

/** Cancelar lo que está en curso: un círculo con ×, que se pone rojo al pasar encima. */
export function CancelButton(props: { label: string; onClick: () => void; disabled?: boolean; class?: string }) {
  return (
    <button
      type="button"
      class={cn(
        "grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-surface-raised p-0 text-neutral-500 transition-colors outline-none hover:border-error/40 hover:bg-error/10 hover:text-error-strong focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error-strong disabled:pointer-events-none disabled:opacity-60",
        props.class,
      )}
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <X size={12} stroke-width={2.4} aria-hidden="true" />
    </button>
  );
}

/** Deshacer lo hecho en su sitio: la basura desinstala y el eslabón roto desconecta. */
export function RemoveButton(props: {
  label: string;
  icon: "trash" | "unlink";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      class="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border border-transparent p-0 text-error-strong opacity-75 transition-[opacity,background-color,border-color] outline-none hover:border-error/30 hover:bg-error/10 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error-strong disabled:pointer-events-none disabled:opacity-40"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      {props.icon === "trash" ? <Trash2 size={13} aria-hidden="true" /> : <Unlink size={13} aria-hidden="true" />}
    </button>
  );
}
