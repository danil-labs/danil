import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { destinoAbrible } from "@terminus/chat";
import { t } from "../../lib/i18n";
import { useTheme } from "../theme";

/**
 * El `iframe` de la ventana en el teléfono: HTML que no sale a la red (su CSP),
 * no navega y mide su alto. El runtime del escritorio avisa por
 * `parent.postMessage`; en un WebView `parent` es la propia página, así que
 * antes de cargar se le cambia por el puente de React Native.
 */
const BRIDGE = `(function () {
  var send = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  try { window.postMessage = function (m) { send(m); }; } catch (e) {}
  window.addEventListener("error", function () { send({ type: "terminus:visual-error" }); });
})(); true;`;

export function WebFrame({ html, minHeight = 48, maxHeight = 4096, inset = 0, onError, onReady }: { html: string; minHeight?: number; maxHeight?: number; inset?: number; onError?: () => void; onReady?: () => void }) {
  const theme = useTheme();
  const [height, setHeight] = useState(minHeight);
  // Igual que en la web: avisa la primera medida, o poco después de cargar si no llega.
  const fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announce = () => {
    clearTimeout(fallback.current);
    onReady?.();
  };
  useEffect(() => () => clearTimeout(fallback.current), []);
  // Una página que navega sola no apila avisos: uno a la vez.
  const asking = useRef(false);
  /**
   * Solo se abre lo que tocó la persona. iOS lo dice (`navigationType`
   * `click`); Android no (siempre `other`), así que pregunta antes. Una
   * navegación que la página hizo sola se bloquea sin más.
   */
  const openExternal = (request: ShouldStartLoadRequest, target: string) => {
    if (Platform.OS === "ios") {
      if ((request as { navigationType?: string }).navigationType === "click") void Linking.openURL(target);
      return;
    }
    if (asking.current) return;
    asking.current = true;
    const done = () => {
      asking.current = false;
    };
    Alert.alert(t("chat.link.open_title"), target, [
      { text: t("chat.link.cancel"), style: "cancel", onPress: done },
      {
        text: t("chat.link.open"),
        onPress: () => {
          done();
          void Linking.openURL(target);
        },
      },
    ], { cancelable: true, onDismiss: done });
  };
  const onMessage = (event: WebViewMessageEvent) => {
    let message: { type?: string; height?: number } | null = null;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message?.type === "terminus:visual-height" && typeof message.height === "number") {
      setHeight(Math.max(minHeight, Math.min(maxHeight, message.height)));
      announce();
    }
    if (message?.type === "terminus:visual-error") onError?.();
  };
  return (
    <View style={[styles.frame, { height: height + inset * 2, padding: inset, borderColor: theme.border }]}>
      <WebView
        source={{ html }}
        originWhitelist={["about:*"]}
        injectedJavaScriptBeforeContentLoaded={BRIDGE}
        onMessage={onMessage}
        onLoadEnd={() => {
          fallback.current = setTimeout(announce, 600);
        }}
        // No navega: un enlace del agente con http(s) que la persona tocó se abre en el navegador del sistema, lo demás se ignora.
        onShouldStartLoadWithRequest={(request) => {
          if (request.url.startsWith("about:")) return true;
          const target = destinoAbrible(request.url);
          if (target && request.isTopFrame !== false) openExternal(request, target);
          return false;
        }}
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        allowsInlineMediaPlayback
        scrollEnabled={false}
        nestedScrollEnabled
        style={{ backgroundColor: "transparent" }}
        containerStyle={{ backgroundColor: "transparent" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignSelf: "stretch", borderRadius: 10, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
});
