import { Show } from "solid-js";
import type { SesionesDeAjustes } from "../model/sessions-port";
import DanilAccount, { type DanilAccountPart } from "./DanilAccount";
import SessionAccounts from "./SessionAccounts";
import type { MaquinasDeAjustes } from "../model/machines-port";

export default function DanilAccountsEntry(props: { part?: DanilAccountPart; maquinas: MaquinasDeAjustes; sesiones: SesionesDeAjustes }) {
  const { usesGroupAccounts } = props.sesiones;
  return <Show when={(!props.part || props.part === "profile") && usesGroupAccounts()} fallback={<DanilAccount {...props} />}><SessionAccounts sesiones={props.sesiones} /></Show>;
}
