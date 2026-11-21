/**
 * Tarjeta de aprobación / confirmación de seguridad para herramientas sensibles.
 * Paridad visual con apps/desktop/src/features/chat/InterruptionBlock.tsx y Chat.tsx:2081-2139.
 */

import { Show } from "solid-js";
import { Button } from "@danil/ui";
import type { PermissionPiece } from "../model.ts";

export interface ToolPermissionCardProps {
  permission: PermissionPiece;
  onDecide: (requestId: string, decision: "allow" | "deny") => void;
  isResponding?: boolean;
}

export function ToolPermissionCard(props: ToolPermissionCardProps) {
  return (
    <section
      data-interruption="permission"
      class="my-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden rounded-lg border border-warning/60 ring-1 ring-warning/15 bg-surface-raised p-3 shadow-sm outline-none"
    >
      <div>
        <p class="m-0 text-sm font-semibold text-neutral-950 dark:text-neutral-100">
          Autorización requerida
        </p>
        <p class="m-0 text-sm text-neutral-700 dark:text-neutral-300 mt-1">
          El agente solicita ejecutar la herramienta:{" "}
          <code class="rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-neutral-900 dark:text-neutral-100">
            {props.permission.toolName}
          </code>
        </p>
        <Show when={props.permission.target}>
          <div class="mt-2">
            <code class="block max-h-40 overflow-auto rounded-sm border border-border bg-surface-muted p-3 font-mono text-xs break-words whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
              {props.permission.target}
            </code>
          </div>
        </Show>
      </div>

      <Show
        when={props.permission.status === "pending"}
        fallback={
          <div class="text-caption text-neutral-500 italic">
            {props.permission.status === "allowed" ? (
              <span class="text-success-strong font-medium">✓ Ejecución autorizada</span>
            ) : (
              <span class="text-error-strong font-medium">✗ Ejecución denegada</span>
            )}
          </div>
        }
      >
        <div class="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={props.isResponding}
            onClick={() => props.onDecide(props.permission.requestId, "deny")}
          >
            Denegar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={props.isResponding}
            onClick={() => props.onDecide(props.permission.requestId, "allow")}
          >
            Autorizar
          </Button>
        </div>
      </Show>
    </section>
  );
}
