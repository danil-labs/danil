import { type JSX, Show } from "solid-js";
import { type GovernedSection, lockedBy } from "../../lib/governance";
import { t } from "../../lib/i18n";

/** El aviso de una sección que gobierna Harness. */
export function GovernedNotice(props: { section: GovernedSection }) {
  return (
    <Show when={lockedBy(props.section)}>
      {(g) => (
        <p role="status" class="m-0 rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-neutral-950">
          {t("harness.governance.banner", { workspace: g().workspace_name })}
        </p>
      )}
    </Show>
  );
}

/** La sección entera de solo lectura mientras Harness la bloquee: `fieldset` desactiva cada control. */
export function Governed(props: { section: GovernedSection; children: JSX.Element }) {
  return (
    <>
      <GovernedNotice section={props.section} />
      <fieldset disabled={lockedBy(props.section) !== null} class="m-0 grid min-w-0 border-0 p-0">
        {props.children}
      </fieldset>
    </>
  );
}
