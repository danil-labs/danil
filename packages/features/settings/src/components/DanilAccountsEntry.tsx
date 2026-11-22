import { Show } from "solid-js";
import { usesGroupAccounts } from "../../../../shell/src/shell";
import DanilAccount, { type DanilAccountPart } from "./DanilAccount";
import SessionAccounts from "./SessionAccounts";
import type { MaquinasDeAjustes } from "../model/machines-port";

export default function DanilAccountsEntry(props: { part?: DanilAccountPart; maquinas: MaquinasDeAjustes }) {
  return <Show when={(!props.part || props.part === "profile") && usesGroupAccounts()} fallback={<DanilAccount {...props} />}><SessionAccounts /></Show>;
}
