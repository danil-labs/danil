import { Show } from "solid-js";
import type { SesionesDeAjustes } from "../model/sessions-port";
import DanilAccount from "./DanilAccount";
import SessionAccounts from "./SessionAccounts";

export default function DanilAccountsEntry(props: {
  workspace: string | null;
  context?: string | null;
  sesiones: SesionesDeAjustes;
}) {
  const { usesGroupAccounts } = props.sesiones;
  return (
    <Show
      when={usesGroupAccounts()}
      fallback={<DanilAccount workspace={props.workspace} context={props.context} sesiones={props.sesiones} />}
    >
      <SessionAccounts workspace={props.workspace} context={props.context} sesiones={props.sesiones} />
    </Show>
  );
}
