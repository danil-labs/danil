import { Show, children, splitProps, type JSX } from "solid-js";
import { cn } from "../../../apps/desktop/src/lib/utils";

/**
 * El cuerpo de un destino de Configuración: sus secciones, una bajo otra.
 * Columna `minmax(0,1fr)`: con la implícita, una URL larga ensanchaba el
 * panel por encima de la hoja y cortaba los botones de todas las filas.
 */
export function SettingsPanel(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [own, rest] = splitProps(props, ["class"]);
  return <div class={cn("grid grid-cols-[minmax(0,1fr)] gap-9", own.class)} {...rest} />;
}

export type SettingsSectionProps = Omit<JSX.HTMLAttributes<HTMLElement>, "title"> & {
  /** El título de la sección. Ya traducido. */
  title?: JSX.Element;
  /** Lo que acompaña al título a su derecha: la acción de toda la sección. */
  aside?: JSX.Element;
  /** Qué gobierna la sección, bajo el título. Ya traducido. */
  description?: JSX.Element;
};

/** Un título y sus filas. La línea entre filas la pone cada fila. */
export function SettingsSection(props: SettingsSectionProps) {
  const [own, rest] = splitProps(props, [
    "title",
    "aside",
    "description",
    "class",
    "children",
  ]);
  const title = children(() => own.title);
  const aside = children(() => own.aside);
  const description = children(() => own.description);
  return (
    <section class={cn("grid min-w-0 gap-0.5", own.class)} {...rest}>
      <Show when={title() || aside()}>
        <header class="flex min-h-7 min-w-0 flex-wrap items-center gap-2">
          <h3 class="m-0 min-w-0 flex-1 text-base font-semibold">{title()}</h3>
          {aside()}
        </header>
      </Show>
      <Show when={description()}>
        <p class="m-0 text-ui leading-[19px] text-neutral-500">{description()}</p>
      </Show>
      <div class="grid min-w-0">{own.children}</div>
    </section>
  );
}

export type SettingsRowProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children"> & {
  /** Lo que va antes del nombre: un avatar, una marca, un icono. */
  lead?: JSX.Element;
  /** El nombre del ajuste. Ya traducido; vacío, la fila va sin nombre. */
  label: JSX.Element;
  /** Qué hace o en qué estado está. Ya traducido. */
  description?: JSX.Element;
  /** El control, a la derecha. */
  children?: JSX.Element;
};

/** Nombre y descripción a la izquierda, control a la derecha. */
export function SettingsRow(props: SettingsRowProps) {
  const [own, rest] = splitProps(props, [
    "lead",
    "label",
    "description",
    "class",
    "children",
  ]);
  const description = children(() => own.description);
  const control = children(() => own.children);
  return (
    <div
      class={cn(
        "flex min-w-0 flex-col items-stretch gap-3 border-b border-border py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-8",
        own.class,
      )}
      {...rest}
    >
      <div class="flex min-w-0 flex-1 items-center gap-3">
        {own.lead}
        <div class="grid min-w-0 flex-1 gap-[3px]">
          <Show when={own.label !== ""}>
            <div class="min-w-0 text-sm">{own.label}</div>
          </Show>
          <Show when={description()}>
            <div class="min-w-0 text-ui leading-[19px] text-neutral-500">
              {description()}
            </div>
          </Show>
        </div>
      </div>
      <Show when={control()}>
        <div class="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">{control()}</div>
      </Show>
    </div>
  );
}

/** Una fila de ancho completo: lo que no cabe en nombre y control. */
export function SettingsBlock(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [own, rest] = splitProps(props, ["class"]);
  return (
    <div
      class={cn(
        "grid min-w-0 gap-2.5 border-b border-border py-3.5 last:border-b-0",
        own.class,
      )}
      {...rest}
    />
  );
}
