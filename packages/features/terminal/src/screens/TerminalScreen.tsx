import { Show, createEffect } from "solid-js";
import {} from "@danil/ui";
import { useShell, type ShellConnection } from "../queries.ts";
import {
  Terminal,
  TerminalBar,
  TerminalName,
  TerminalBody,
  TerminalCursor,
} from "../components/TerminalPrimitives.tsx";
import { AnsiText } from "../components/AnsiText.tsx";
import { TerminalError } from "../components/TerminalError.tsx";

export interface TerminalScreenProps {
  conn?: ShellConnection;
  command?: string;
  project?: string;
  session?: string;
  title?: string;
}

/**
 * Pantalla de Terminal interactiva conectada al motor Danil por RPC1.
 * Soporta stream de salida ANSI, interacción stdin y buffer para B-017.
 * Puede invocarse como componente JSX <TerminalScreen conn={conn} />
 * o directamente como TerminalScreen(conn).
 */
export function TerminalScreen(
  propsOrConn: TerminalScreenProps | ShellConnection
) {
  const isDirectConn =
    typeof propsOrConn === "function" ||
    ("client" in (propsOrConn as object)) ||
    ("status" in (propsOrConn as object) && !("conn" in (propsOrConn as object)));

  const props: TerminalScreenProps = isDirectConn
    ? { conn: propsOrConn as ShellConnection }
    : (propsOrConn as TerminalScreenProps);

  const shell = useShell(
    () => (typeof props.conn === "function" ? props.conn() : props.conn),
    {
      session: props.session,
      command: props.command,
      project: props.project,
      autoStart: true,
    }
  );

  let bodyRef: HTMLPreElement | undefined;

  const handleKeyDown = (e: KeyboardEvent) => {
    // Interrupción por teclado Ctrl+C
    if (e.ctrlKey && e.key === "c") {
      e.preventDefault();
      if (shell.status() === "running") {
        void shell.stop();
      } else {
        void shell.write("\x03");
      }
      return;
    }

    // Fin de transmisión Ctrl+D
    if (e.ctrlKey && e.key === "d") {
      e.preventDefault();
      void shell.write("\x04");
      return;
    }

    // Ignorar teclas modificadoras solitarias
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
      return;
    }

    e.preventDefault();

    if (e.key === "Enter") {
      void shell.write("\r");
    } else if (e.key === "Backspace") {
      void shell.write("\x7f");
    } else if (e.key === "Tab") {
      void shell.write("\t");
    } else if (e.key === "ArrowUp") {
      void shell.write("\x1b[A");
    } else if (e.key === "ArrowDown") {
      void shell.write("\x1b[B");
    } else if (e.key === "ArrowRight") {
      void shell.write("\x1b[C");
    } else if (e.key === "ArrowLeft") {
      void shell.write("\x1b[D");
    } else if (e.key.length === 1) {
      void shell.write(e.key);
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData?.getData("text");
    if (pasted) {
      void shell.write(pasted);
    }
  };

  createEffect(() => {
    // Auto-scroll al final con cada fragmento de salida recibido
    shell.output();
    if (bodyRef) {
      bodyRef.scrollTop = bodyRef.scrollHeight;
    }
  });

  const displayTitle = () => props.title ?? "Terminal";

  return (
    <Terminal class="h-full flex flex-col">
      <TerminalBar>
        <div class="flex items-center gap-2 min-w-0">
          <TerminalName>
            <span
              class="w-2 h-2 rounded-full inline-block"
              classList={{
                "bg-yellow-400 animate-pulse": shell.status() === "starting",
                "bg-green-500": shell.status() === "running",
                "bg-red-500": shell.status() === "error",
                "bg-neutral-500": shell.status() === "done" || shell.status() === "idle",
              }}
            />
            <span>{displayTitle()}</span>
            <Show when={shell.pid()}>
              <span class="text-terminal-muted font-normal text-[11px]">
                (PID: {shell.pid()})
              </span>
            </Show>
          </TerminalName>
        </div>

        <div class="flex items-center gap-3">
          <Show when={!shell.isPtyReady() && shell.bufferedCount() > 0}>
            <span class="text-amber-400 text-[11px] font-mono bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40">
              Buffer: {shell.bufferedCount()} teclas retenidas (B-017)
            </span>
          </Show>
          <Show when={shell.status() === "starting"}>
            <span class="text-yellow-400/80 text-[11px]">Iniciando pty...</span>
          </Show>
          <Show when={shell.status() === "running"}>
            <button
              type="button"
              onClick={() => void shell.stop()}
              class="px-2 py-0.5 rounded bg-terminal-accent/20 hover:bg-terminal-accent/30 text-terminal-accent text-xs font-mono"
              title="Detener proceso (Ctrl+C)"
            >
              Detener
            </button>
          </Show>
          <button
            type="button"
            onClick={() => shell.clear()}
            class="px-2 py-0.5 rounded bg-terminal-bar hover:bg-surface text-terminal-muted hover:text-terminal-text text-xs"
            title="Limpiar pantalla"
          >
            Limpiar
          </button>
        </div>
      </TerminalBar>

      <Show when={shell.error()}>
        <TerminalError
          message={shell.error()!}
          onRetry={() => void shell.retry()}
        />
      </Show>

      <TerminalBody
        ref={bodyRef}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        tabIndex={0}
        title="Terminal interactiva - Haz clic para enfocar y escribir"
      >
        <AnsiText text={shell.output()} />
        <Show when={shell.status() === "running"}>
          <TerminalCursor />
        </Show>
      </TerminalBody>
    </Terminal>
  );
}
