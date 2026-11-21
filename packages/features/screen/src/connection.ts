import { screenEnd, type ScreenEnd } from "@terminus/computers";

export type Phase = "connecting" | "live" | ScreenEnd | "failed";

type Viewer = EventTarget & {
  disconnect(): void;
  viewOnly: boolean;
  scaleViewport: boolean;
  background: string;
};
type ViewerClass = new (target: HTMLElement, socket: WebSocket, options: { shared: boolean }) => Viewer;

/** El socket se abre cuando el visor puede recibir RFB; cada intento es dueño de sus recursos. */
export function screenConnection(options: {
  target: HTMLElement;
  load: () => Promise<{ default: ViewerClass }>;
  open: () => Promise<WebSocket>;
  phase: (phase: Phase) => void;
  configure?: (view: Viewer) => (() => void);
}) {
  let attempt = 0;
  let release: (() => void) | undefined;

  const disconnect = () => {
    attempt++;
    release?.();
    release = undefined;
    options.target.replaceChildren();
  };

  const connect = async () => {
    disconnect();
    const mine = attempt;
    options.phase("connecting");
    try {
      const { default: RFB } = await options.load();
      if (mine !== attempt) return;
      const socket = await options.open();
      if (mine !== attempt) return socket.close();
      let view: Viewer | undefined;
      let dispose: (() => void) | undefined;
      let live = false;
      let code = 1000;
      const closed = (e: CloseEvent) => { code = e.code; };
      socket.addEventListener("close", closed);
      release = () => {
        dispose?.();
        dispose = undefined;
        socket.removeEventListener("close", closed);
        view?.disconnect();
        socket.close();
      };
      view = new RFB(options.target, socket, { shared: true });
      view.viewOnly = true;
      view.scaleViewport = true;
      view.background = "transparent";
      dispose = options.configure?.(view);
      view.addEventListener("connect", () => {
        live = true;
        if (mine === attempt) options.phase("live");
      });
      view.addEventListener("disconnect", () => {
        if (mine !== attempt) return;
        dispose?.();
        dispose = undefined;
        options.phase(live ? "ended" : screenEnd(code));
      });
    } catch {
      if (mine !== attempt) return;
      disconnect();
      options.phase("failed");
    }
  };

  return { connect, disconnect };
}
