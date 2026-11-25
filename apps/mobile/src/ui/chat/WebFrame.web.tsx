import { SANDBOX_ARTEFACTO } from "@terminus/chat";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";

/**
 * En el navegador, la visualización va en el mismo `iframe` que en la ventana
 * (`ChatVisual.tsx`): `srcdoc`, `allow-scripts` sin `allow-same-origin`, y el
 * alto que el runtime manda con `terminus:visual-height` desde ese marco.
 * `onReady` avisa la primera vez que ya midió (o, si nunca mide, poco después
 * de cargar), para que quien lo muestra no lo destape a medio pintar.
 * `inset` separa del borde el fondo que el agente le haya puesto a su página.
 */
export function WebFrame({ html, minHeight = 48, maxHeight = 4096, inset = 0, onError, onReady }: { html: string; minHeight?: number; maxHeight?: number; inset?: number; onError?: () => void; onReady?: () => void }) {
  const theme = useTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);
  const ready = useRef(onReady);
  ready.current = onReady;
  const fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announce = () => {
    clearTimeout(fallback.current);
    ready.current?.();
  };
  useEffect(() => () => clearTimeout(fallback.current), []);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = event.data as { type?: string; height?: number } | null;
      if (message?.type === "terminus:visual-height" && typeof message.height === "number") {
        setHeight(Math.max(minHeight, Math.min(maxHeight, message.height)));
        announce();
      }
      if (message?.type === "terminus:visual-error") onError?.();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [minHeight, maxHeight, onError]);
  return (
    <View style={[styles.frame, { height: height + inset * 2, padding: inset, borderColor: theme.border }]}>
      <iframe ref={frame} title="visual" srcDoc={html} sandbox={SANDBOX_ARTEFACTO} onLoad={() => { fallback.current = setTimeout(announce, 600); }} style={{ width: "100%", height: "100%", border: 0, background: "transparent" }} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignSelf: "stretch", borderRadius: 10, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
});
