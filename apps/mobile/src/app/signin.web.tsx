import { Redirect } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAccount } from "../lib/account";
import { WEB_BASE } from "../lib/alpha-mode";
import { SIGNED_OUT } from "../lib/edge-account";
import { t, w } from "../lib/i18n";
import { WEB_LOGIN } from "../lib/supabase.web";
import { useTheme } from "../ui/theme";

/**
 * La entrada en el navegador. Por el borde es la de identity (WorkOS), como la web: vuelve a la
 * raíz de la web, que es una vuelta exacta de identity, y la raíz manda el teléfono aquí. Tras
 * salir a propósito, o si identity no contesta, no se abre sola: se ofrece entrar o reintentar.
 * Sin borde, la entrada común de la web conserva el destino del teléfono.
 */
export default function SignIn() {
  const theme = useTheme();
  const { session, loginUrl, unavailable, retry } = useAccount();
  const signedOut = window.sessionStorage.getItem(SIGNED_OUT) === "1";
  const enter = () => {
    if (loginUrl) {
      window.location.assign(loginUrl(new URL(WEB_BASE, window.location.origin).href));
      return;
    }
    const base = process.env.EXPO_PUBLIC_TERMINUS_WEB_BASE || "/terminus/";
    const url = new URL(WEB_LOGIN, window.location.origin);
    url.searchParams.set("next", window.sessionStorage.getItem("terminus.web.return") || `${base}m/${window.location.search}`);
    window.location.assign(url.toString());
  };
  useEffect(() => {
    if (!session && !signedOut && !unavailable) enter();
  }, [unavailable]);
  if (session) return <Redirect href="/" />;
  if (unavailable) {
    return (
      <View style={[styles.page, { backgroundColor: theme.bg }]}>
        <Text testID="signin-unavailable" style={[styles.hint, { color: theme.textMuted }]}>{w("web.platform.unavailable")}</Text>
        <Pressable testID="signin-retry" onPress={retry} style={[styles.button, { backgroundColor: theme.primary }]}>
          <Text style={[styles.buttonText, { color: theme.onPrimary }]}>{w("web.computers.retry")}</Text>
        </Pressable>
      </View>
    );
  }
  if (!signedOut) return null;
  return (
    <View style={[styles.page, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>{t("signin.title")}</Text>
      <Pressable testID="signin-submit" onPress={enter} style={[styles.button, { backgroundColor: theme.primary }]}>
        <Text style={[styles.buttonText, { color: theme.onPrimary }]}>{t("signin.submit")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 24, paddingTop: 96, gap: 10 },
  title: { fontSize: 28, fontWeight: "800" },
  hint: { fontSize: 16, lineHeight: 21, marginBottom: 8 },
  button: { borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  buttonText: { fontSize: 16, fontWeight: "600" },
});
