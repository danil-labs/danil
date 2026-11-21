import { Show } from "solid-js";
import { usesGroupAccounts } from "../../../../shell/src/shell";
import DanilAccount, { type DanilAccountPart } from "./DanilAccount";
import SessionAccounts from "./SessionAccounts";

export default function DanilAccountsEntry(props: { part?: DanilAccountPart }) {
  return <Show when={(!props.part || props.part === "profile") && usesGroupAccounts()} fallback={<DanilAccount {...props} />}><SessionAccounts /></Show>;
}
