// Lo que usa `Screen.tsx` de noVNC, que no publica tipos.
declare module "@novnc/novnc" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string | WebSocket, options?: { shared?: boolean });
    viewOnly: boolean;
    scaleViewport: boolean;
    clipViewport: boolean;
    background: string;
    disconnect(): void;
  }
}
