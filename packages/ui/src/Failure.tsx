import { Show } from "solid-js";
import { t } from "./lib/i18n";
import { prosa } from "./lib/prose.ts";
import type { Failure } from "./lib/failure.ts";

export { asFailure, claveDe, detalleDe, prosaDe, type Failure } from "./lib/failure.ts";

export function FailureNote(props: { f: Failure }) {
  return (
    <div class="flex flex-col gap-1 py-3 pr-3.5 font-mono text-xs text-error-strong">
      <span class="font-sans text-ui">{prosa(props.f.what)}</span>
      <Show when={props.f.detail}>
        <details>
          <summary class="cursor-pointer font-sans text-caption text-neutral-500">
            {t("common.failure.detail")}
          </summary>
          <p class="m-0 mt-1 font-mono text-caption break-all whitespace-pre-wrap text-neutral-500">
            {props.f.detail}
          </p>
        </details>
      </Show>
    </div>
  );
}
