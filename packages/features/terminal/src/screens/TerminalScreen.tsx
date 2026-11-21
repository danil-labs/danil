import { Show, createEffect } from "solid-js";
import { Button } from "@danil/ui";
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
 * Paridad visual con apps/desktop/src/ui/Terminal.tsx y terminal.css.
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
                "bg-warning-strong animate-pulse": shell.status() === "starting",
                "bg-success-strong": shell.status() === "running",
                "bg-error-strong": shell.status() === "error",
                "bg-neutral-500": shell.status() === "done" || shell.status() === "idle",
              }}
            />
            <span>{displayTitle()}</span>
            <Show when={shell.pid()}>
              <span class="text-terminal-muted font-normal text-caption font-mono">
                (PID: {shell.pid()})
              </span>
            </Show>
          </TerminalName>
        </div>

        <div class="flex items-center gap-2">
          <Show when={!shell.isPtyReady() && shell.bufferedCount() > 0}>
            <span class="text-warning-strong text-caption font-mono bg-warning/10 px-1.5 py-0.5 rounded border border-warning/20">
              Buffer: {shell.bufferedCount()}
            </span>
          </Show>
          <Show when={shell.status() === "starting"}>
            <span class="text-warning-strong text-caption">Iniciando...</span>
          </Show>
          <Show when={shell.status() === "running"}>
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={() => void shell.stop()}
              title="Detener proceso (Ctrl+C)"
              class="text-caption font-mono"
            >
              Detener
            </Button>
          </Show>
          <Button
            type="button"
            variant="ghost"
            size="compact"
            onClick={() => shell.clear()}
            title="Limpiar pantalla"
            class="text-caption text-terminal-muted hover:text-terminal-text"
          >
            Limpiar
          </Button>
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
