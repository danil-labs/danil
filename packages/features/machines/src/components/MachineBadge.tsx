import { SignalDot, type SignalTone } from "@danil/ui";
import type { ConnectionStatus } from "../model.ts";

export interface MachineBadgeProps {
  state?: "running" | "stopped" | "starting" | "stopping" | string;
  connection?: "connected" | "disconnected" | string;
  engineStatus?: ConnectionStatus;
  isOperating?: "starting" | "stopping";
}

export function MachineBadge(props: MachineBadgeProps) {
  const isPending = () =>
    Boolean(
      props.isOperating ||
        props.state === "starting" ||
        props.state === "stopping" ||
        props.engineStatus === "waking" ||
        props.engineStatus === "connecting" ||
        props.engineStatus === "reconnecting",
    );

  const label = () => {
    if (props.engineStatus === "waking") return "encendiendo…";
    if (props.engineStatus === "connecting") return "conectando…";
    if (props.engineStatus === "reconnecting") return "reconectando…";
    if (props.isOperating === "starting" || props.state === "starting") return "iniciando…";
    if (props.isOperating === "stopping" || props.state === "stopping") return "deteniendo…";
    if (props.state === "running") {
      return props.connection === "connected" || props.engineStatus === "connected"
        ? "activa · conectada"
        : "activa";
    }
    if (props.state === "stopped") return "apagada";
    return props.state ?? "desconocida";
  };

  const tone = (): SignalTone => {
    if (isPending()) return "warning";
    if (props.state === "running") return "success";
    return "off";
  };

  return (
    <span class="inline-flex items-center gap-1.5 text-xs text-neutral-500">
      <SignalDot tone={tone()} pulse={isPending()} />
      <span data-machine-state="">{label()}</span>
    </span>
  );
}
