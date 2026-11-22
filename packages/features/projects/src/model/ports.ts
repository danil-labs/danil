import type { Component } from "solid-js";
import type { OpcionDeModelo } from "../../../../../apps/desktop/src/lib/models";
import type { CreateFreeRouterConsent } from "../../../../ui/src/lib/freeRouterConsent.ts";
import type { EstadoLocal, MarcaLocal } from "../../../../ui/src/lib/localStatus";
import type { Machine } from "../../../../ui/src/lib/machine";

/** Lo que el alta y el perfil de un agente le pasan al selector de modelo de chat. */
export type SelectorDeModeloProps = {
  createFreeRouterConsent: CreateFreeRouterConsent;
  models: OpcionDeModelo[];
  superficie: string;
  model: string;
  onChange: (model: OpcionDeModelo) => void;
};

/**
 * Lo que projects usa de machines (la máquina de una tarea), de code (la marca
 * local de un archivo) y de chat (el selector de modelo). Es de esas features y
 * lo enchufa el shell al arrancar (R3): las pantallas lo leen con los mismos
 * nombres que exporta cada una.
 */
export type PuertosDeProyectos = {
  machines: () => Machine[];
  machineName: (id: string, local?: boolean) => string;
  machineSystem: (id: string) => string | null;
  bringHereLabel: () => string;
  canBringHere: () => boolean;
  MachineChip: Component<{ machine: string; on: boolean; class?: string }>;
  localDe: (project: string, session: string, arbol: string, ruta: string) => EstadoLocal | undefined;
  colorDeMarca: (marca: MarcaLocal) => string;
  describirEstado: (estado: EstadoLocal) => string;
  SelectorDeModelo: Component<SelectorDeModeloProps>;
};

let puertos: PuertosDeProyectos;

/** El shell lo llama una vez, antes de montar la app. */
export function enchufarPuertos(p: PuertosDeProyectos) {
  puertos = p;
}

export const machines = () => puertos.machines();
export const machineName = (id: string, local?: boolean) => puertos.machineName(id, local);
export const machineSystem = (id: string) => puertos.machineSystem(id);
export const bringHereLabel = () => puertos.bringHereLabel();
export const canBringHere = () => puertos.canBringHere();
export const MachineChip: PuertosDeProyectos["MachineChip"] = (props) => puertos.MachineChip(props);
export const localDe: PuertosDeProyectos["localDe"] = (project, session, arbol, ruta) => puertos.localDe(project, session, arbol, ruta);
export const colorDeMarca = (marca: MarcaLocal) => puertos.colorDeMarca(marca);
export const describirEstado = (estado: EstadoLocal) => puertos.describirEstado(estado);
export const SelectorDeModelo: PuertosDeProyectos["SelectorDeModelo"] = (props) => puertos.SelectorDeModelo(props);
