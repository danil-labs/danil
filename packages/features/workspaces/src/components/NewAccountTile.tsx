import type { JSX } from "solid-js";

export function NewAccountTile(props: { id: string; isNew?: boolean; children: JSX.Element }) {
  return <div class="contents" data-account-new={props.isNew ? "" : undefined}>{props.children}</div>;
}
