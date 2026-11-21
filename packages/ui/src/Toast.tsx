import { cva, type VariantProps } from "class-variance-authority";
import { createSignal, onCleanup, Show, splitProps, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { cn } from "./lib/utils";
import { Button } from "./Button";
import { Close } from "./icons";

const [toastHost, setToastHost] = createSignal<HTMLDivElement>();

export function ToastPortal(props: { children?: JSX.Element }) {
  return <Show when={toastHost()}>{host => <Portal mount={host()}>{props.children}</Portal>}</Show>;
}

/**
 * La pila de avisos que no interrumpen, abajo a la derecha.
 *
 * El primero que se monta queda arriba. `pointer-events-none` en la pila y
 * `auto` en cada tarjeta: sin eso el hueco entre dos avisos se come los clics
 * de la esquina de la conversación.
 */
export function ToastStack(props: { children?: JSX.Element }) {
  onCleanup(() => setToastHost(undefined));
  return (
    // `z` alto: se pone por encima de la conversación, pero **no** encima
    // de un diálogo que esté pidiendo algo — esos van más arriba.
    <div ref={setToastHost} class="pointer-events-none fixed bottom-4 right-4 z-50 grid justify-items-end gap-2">
      {props.children}
    </div>
  );
}

/** Un aviso de la pila. `error` cambia el borde y anuncia como `alert`. */
const toastVariants = cva(
  "pointer-events-auto flex w-[320px] max-w-[calc(100vw-2rem)] items-start gap-2 rounded-md border bg-surface-raised px-3 py-2.5 shadow-md",
  {
    variants: {
      tone: {
        status: "border-border",
        error: "border-error-strong",
      },
    },
    defaultVariants: { tone: "status" },
  },
);

type ToastPropias = VariantProps<typeof toastVariants> & {
  /** Sin esto no se pinta la cruz: el aviso lo cierra su propio botón. */
  onDismiss?: () => void;
  /** Texto accesible para el botón de cerrar. Por defecto "Cerrar". */
  dismissLabel?: string;
};

export type ToastProps = JSX.HTMLAttributes<HTMLDivElement> & ToastPropias;

export function Toast(props: ToastProps) {
  const [propios, resto] = splitProps(props, [
    "class",
    "tone",
    "onDismiss",
    "dismissLabel",
    "children",
  ]);
  return (
    <div
      class={cn(toastVariants({ tone: propios.tone }), propios.class)}
      role={propios.tone === "error" ? "alert" : "status"}
      {...resto}
    >
      <div class="grid min-w-0 flex-1 gap-2">{propios.children}</div>
      <Show when={propios.onDismiss}>
        <Button
          variant="ghost"
          size="iconCompact"
          class="-mr-1.5 -mt-0.5 shrink-0 text-neutral-500"
          aria-label={propios.dismissLabel ?? "Cerrar"}
          onClick={() => propios.onDismiss?.()}
        >
          <Close size={14} />
        </Button>
      </Show>
    </div>
  );
}
