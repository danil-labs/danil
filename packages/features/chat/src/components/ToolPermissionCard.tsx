/**
 * Tarjeta de aprobación / confirmación de seguridad para herramientas sensibles.
 */

import { Show } from "solid-js";
import type { PermissionPiece } from "../model.ts";

export interface ToolPermissionCardProps {
  permission: PermissionPiece;
  onDecide: (requestId: string, decision: "allow" | "deny") => void;
  isResponding?: boolean;
}

export function ToolPermissionCard(props: ToolPermissionCardProps) {
  return (
    <div class="my-3 p-3 rounded-lg border border-amber-600/30 bg-amber-950/20 text-xs">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div>
          <span class="font-semibold text-amber-300">Aprobación requerida</span>
          <p class="text-stone-300 mt-1">
            El agente solicita ejecutar la herramienta:{" "}
            <code class="font-mono bg-stone-800 px-1 py-0.5 rounded text-amber-200">
              {props.permission.toolName}
            </code>
          </p>
          <Show when={props.permission.target}>
            <p class="font-mono text-stone-400 text-[11px] mt-1 break-all">
              Objetivo: {props.permission.target}
            </p>
          </Show>
        </div>
      </div>

      <Show
        when={props.permission.status === "pending"}
        fallback={
          <div class="mt-2 text-stone-400 italic">
            {props.permission.status === "allowed" ? (
              <span class="text-emerald-400">✓ Ejecución autorizada</span>
            ) : (
              <span class="text-rose-400">✗ Ejecución denegada</span>
            )}
          </div>
        }
      >
        <div class="flex items-center gap-2 mt-3">
          <button
            type="button"
            disabled={props.isResponding}
            onClick={() => props.onDecide(props.permission.requestId, "allow")}
            class="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors disabled:opacity-50"
          >
            Autorizar
          </button>
          <button
            type="button"
            disabled={props.isResponding}
            onClick={() => props.onDecide(props.permission.requestId, "deny")}
            class="px-3 py-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors disabled:opacity-50"
          >
            Denegar
          </button>
        </div>
      </Show>
    </div>
  );
}
