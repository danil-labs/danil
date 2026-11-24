import { createSignal } from "solid-js";
import { hasShellCache } from "../../../../session/src/shellCache";
import type { Failure } from "../../../../ui/src/Failure";
import { accountWelcomeAnswered } from "../model/account-welcome";
import type { EnvReport } from "../../../../ui/src/lib/bundled";
import type { Etapa } from "./setup-run";

type Paso = "preparar" | "ia" | "personalizar";

/** Las señales del alta: el reporte, la corrida, el paso en que va y el workspace. */
export function crearEstadoDelAlta() {
  const conFoto = hasShellCache();
  const [reporte, setReporte] = createSignal<EnvReport | null>(null);
  const [mostrar, setMostrar] = createSignal<boolean | null>(null);
  const [seguir, setSeguir] = createSignal(false);
  const [hayEspacio, setHayEspacio] = createSignal<boolean | null>(null);
  const [fallo, setFallo] = createSignal<string | null>(null);
  // Aparte de `fallo`: el servicio que no contestó deja de ser verdad en cuanto vuelve.
  const [falloDelServicio, setFalloDelServicio] = createSignal<string | null>(null);
  const [corriendo, setCorriendo] = createSignal(false);
  const [etapas, setEtapas] = createSignal<Etapa[]>([]);
  const [activa, setActiva] = createSignal<string | null>(null);
  const [parcial, setParcial] = createSignal(0);
  const [reparando, setReparando] = createSignal(false);
  const [falloDeReparar, setFalloDeReparar] = createSignal<Failure | null>(null);
  const [consejo, setConsejo] = createSignal(0);
  const [sinSoporte, setSinSoporte] = createSignal(false);
  // Lo esencial no cabe en disco: la corrida se para antes de empezar y se reintenta entera.
  const [sinEspacio, setSinEspacio] = createSignal<string | null>(null);
  const [bloqueado, setBloqueado] = createSignal(false);
  const [paso, setPaso] = createSignal<Paso>("preparar");
  const [entrando, setEntrando] = createSignal(false);
  const [workspace, setWorkspace] = createSignal<{ id: string; nombre: string } | null>(null);
  const [cuentaRespondida, setCuentaRespondida] = createSignal(accountWelcomeAnswered());
  return {
    reporte, setReporte, mostrar, setMostrar, seguir, setSeguir, hayEspacio, setHayEspacio, fallo, setFallo,
    falloDelServicio, setFalloDelServicio, corriendo, setCorriendo, etapas, setEtapas, activa, setActiva,
    parcial, setParcial, reparando, setReparando, falloDeReparar, setFalloDeReparar, consejo, setConsejo,
    sinSoporte, setSinSoporte, sinEspacio, setSinEspacio, bloqueado, setBloqueado, paso, setPaso, entrando,
    setEntrando, workspace, setWorkspace, cuentaRespondida, setCuentaRespondida, conFoto,
  };
}

export type EstadoDelAlta = ReturnType<typeof crearEstadoDelAlta>;
