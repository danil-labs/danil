import { splitProps } from "solid-js";
import { ariaDeAtajo, textoDeAtajo, type AccionDeAtajo } from "./lib/shortcuts";
import { Button, type ButtonProps } from "./Button";
import { RETARDO_TOOLTIP, TooltipContent, TooltipRoot, TooltipTrigger } from "./Tooltip";

export function TeclaDeAtajo(props: { accion: AccionDeAtajo }) {
  return (
    <kbd class="shrink-0 rounded border border-current/20 px-1 font-mono text-xs font-normal">
      {textoDeAtajo(props.accion)}
    </kbd>
  );
}

export function Atajo(props: { accion: AccionDeAtajo; etiqueta: string }) {
  return (
    <span class="inline-flex items-center gap-2">
      <span>{props.etiqueta}</span>
      <TeclaDeAtajo accion={props.accion} />
    </span>
  );
}

export function BotonConAtajo(props: Omit<ButtonProps, "as"> & {
  accion: AccionDeAtajo;
  etiqueta: string;
}) {
  const [propias, resto] = splitProps(props, ["accion", "etiqueta"]);
  return (
    <TooltipRoot openDelay={RETARDO_TOOLTIP}>
      <Button as={TooltipTrigger} aria-keyshortcuts={ariaDeAtajo(propias.accion)} {...resto} />
      <TooltipContent>
        <Atajo accion={propias.accion} etiqueta={propias.etiqueta} />
      </TooltipContent>
    </TooltipRoot>
  );
}
