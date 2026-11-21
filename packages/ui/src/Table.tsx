import { splitProps, type JSX } from "solid-js";
import { cn } from "./lib/utils";

/**
 * La tabla de datos. La celda separa con borde SUPERIOR: con el inferior, la
 * última fila arrastra una línea suelta bajo la tabla.
 */
export type TableProps = JSX.HTMLAttributes<HTMLTableElement>;

export function Table(props: TableProps) {
  const [propios, resto] = splitProps(props, ["class"]);
  return (
    <table
      class={cn("w-full border-collapse text-left", propios.class)}
      {...resto}
    />
  );
}

export function TableHead(props: JSX.HTMLAttributes<HTMLTableSectionElement>) {
  const [propios, resto] = splitProps(props, ["class"]);
  return <thead class={cn("bg-surface-muted", propios.class)} {...resto} />;
}

export function TableBody(props: JSX.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TableRow(props: JSX.HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} />;
}

export type TableHeaderCellProps = JSX.ThHTMLAttributes<HTMLTableCellElement>;

export function TableHeaderCell(props: TableHeaderCellProps) {
  const [propios, resto] = splitProps(props, ["class"]);
  return (
    <th
      class={cn(
        "px-3 py-2 text-caption font-semibold tracking-wider uppercase text-neutral-500",
        propios.class,
      )}
      {...resto}
    />
  );
}

export type TableCellProps = JSX.TdHTMLAttributes<HTMLTableCellElement>;

export function TableCell(props: TableCellProps) {
  const [propios, resto] = splitProps(props, ["class"]);
  return (
    <td
      class={cn(
        "border-t border-border px-3 py-2 text-ui text-neutral-950",
        propios.class,
      )}
      {...resto}
    />
  );
}
