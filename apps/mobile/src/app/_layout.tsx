import { ALPHA_DEMO, ALPHA_ORDINARY } from "../lib/alpha-mode";
import { CustomizationProvider } from "../lib/customization";
import { InboxProvider } from "../lib/inbox";
import type { NotificationResponse } from "expo-notifications";
import { Stack, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { AccountProvider } from "../lib/account";
import { MachinesProvider } from "../lib/machines";
import { Notifications } from "../lib/notifications";
import { selectWordOnDoubleTap } from "../lib/selection";
import { t, w } from "../lib/i18n";
import { hydrate as hydrateTaskQueue } from "../lib/taskQueue";
import { pinToVisibleArea } from "../lib/viewport";
import { WorkspacesProvider } from "../lib/workspaces";
import { ActivityNotice } from "../ui/ActivityNotice";
import { UpdateNotice } from "../ui/UpdateNotice";
import { useTheme } from "../ui/theme";

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Cierra la ventana del navegador del inicio de sesión si vuelve aquí (solo hace algo en web).
if (!ALPHA_DEMO) WebBrowser.maybeCompleteAuthSession();
selectWordOnDoubleTap();

type Target = { host?: string; workspace?: string; folder?: string | null; task?: string };

function openTarget(response: NotificationResponse | null) {
  const target = response?.notification.request.content.data as Target | undefined;
  if (!target?.host || !target.workspace || !target.task) return;
  router.push({
    pathname: "/task/[host]/[workspace]/[folder]/[id]",
    params: { host: target.host, workspace: target.workspace, folder: target.folder || "_", id: target.task },
  });
}

export default function RootLayout() {
  const theme = useTheme();
  const pathname = usePathname();


  // El stack real conserva el modo explícito también al recargar sus rutas.
  useEffect(() => {
    if (!ALPHA_DEMO || Platform.OS !== "web") return;
    const url = new URL(window.location.href);
    url.searchParams.set("demo", "1");
    if (ALPHA_ORDINARY) url.searchParams.set("ordinary", "1");
    window.history.replaceState(window.history.state, "", url);
  }, [pathname]);

  // En el navegador, una ruta del teléfono que abrió la web de escritorio llega como `?to=` (ver `toPhone` en `apps/desktop/src/web/main.tsx`).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!window.location.pathname.endsWith("/signin")) window.sessionStorage.setItem("terminus.web.return", `${window.location.pathname}${window.location.search}`);
    const to = new URLSearchParams(window.location.search).get("to");
    if (to?.startsWith("/") && !to.startsWith("//")) router.replace(to as never);
  }, []);

  // En el navegador el teclado no achica la página: sin esto se lleva la barra de arriba.
  useEffect(pinToVisibleArea, []);

  // La cola de archivar/finalizar/borrar vive en disco: se recupera al abrir.
  useEffect(() => { void hydrateTaskQueue(); }, []);

  useEffect(() => {
    if (!Notifications) return;
    openTarget(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();
    const subscription = Notifications.addNotificationResponseReceivedListener(openTarget);
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <AccountProvider>
    <MachinesProvider>
      <WorkspacesProvider>
      <CustomizationProvider>
      <InboxProvider>
        <StatusBar style={theme.dark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text,
            contentStyle: { backgroundColor: theme.dark ? theme.bg : theme.muted },
            headerBackButtonDisplayMode: "minimal",
          }}
        >
          <Stack.Screen name="(home)" options={{ headerShown: false }} />
          <Stack.Screen name="workspaces" options={{ headerShown: false }} />
          <Stack.Screen
            name="filter"
            options={{ presentation: "formSheet", sheetAllowedDetents: [0.6, 0.95], sheetGrabberVisible: true, title: w("shell.sidebar.view.trigger") }}
          />
          <Stack.Screen
            name="agents"
            options={{ presentation: "formSheet", sheetAllowedDetents: [0.5, 0.95], sheetGrabberVisible: true, title: w("shell.agent_dock.title") }}
          />
          <Stack.Screen
            name="preview"
            options={Platform.OS === "web" ? { presentation: "transparentModal", headerShown: false, contentStyle: { backgroundColor: "transparent" }, animation: "none" } : { presentation: "formSheet", sheetAllowedDetents: "fitToContents", sheetGrabberVisible: true, headerShown: false, sheetCornerRadius: 18 }}
          />
          <Stack.Screen
            name="task-work"
            options={Platform.OS === "web" ? { presentation: "transparentModal", headerShown: false, contentStyle: { backgroundColor: "transparent" }, animation: "none" } : { presentation: "formSheet", sheetAllowedDetents: [0.5, 0.95], sheetGrabberVisible: true, title: w("chat.work.title") }}
          />
          {/* Listas nativas: cada pantalla apilada pinta su cabecera (`NavBar`), igual en las tres plataformas. */}
          <Stack.Screen name="personalize" options={{ headerShown: false }} />
          <Stack.Screen name="search" options={{ headerShown: false, animation: Platform.OS === "ios" ? "fade" : undefined }} />
          <Stack.Screen name="profile" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="inbox" options={{ headerShown: false }} />
          <Stack.Screen name="inbox-thread" options={{ headerShown: false }} />
          <Stack.Screen name="task-tools" options={{ headerShown: false }} />
          <Stack.Screen name="task-files" options={{ headerShown: false }} />
          {/* El visor de un archivo: entra desde la derecha, desde Archivos o desde el chat. */}
          <Stack.Screen name="file" options={{ headerShown: false }} />
          <Stack.Screen name="activity" options={{ title: t("activity.title") }} />
          <Stack.Screen name="accounts" options={{ title: w("settings.nav.ai_providers") }} />
          <Stack.Screen name="signin" options={{ headerShown: false }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        </Stack>
        <ActivityNotice />
        <UpdateNotice />
      </InboxProvider>
      </CustomizationProvider>
      </WorkspacesProvider>
    </MachinesProvider>
    </AccountProvider>
    </GestureHandlerRootView>
  );
}
