import { MOBILE_WEB_DIR, WEB_LAYOUT_KEY } from "@terminus/design";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../lib/account";
import { BRIDGE_ENABLED } from "../lib/bridge";
import type { Host } from "../lib/hosts";
import { t, w } from "../lib/i18n";
import { useMachines } from "../lib/machines";
import { Dot } from "../ui/components";
import { Icon } from "../ui/Icon";
import { Group, GroupFooter, GroupHeader, LargeTitle, ListRow, NavBar, pageColor } from "../ui/list";
import { useTheme } from "../ui/theme";

/**
 * La raíz de la web de escritorio: la que fijó la compilación
 * (`EXPO_PUBLIC_TERMINUS_WEB_BASE`, `web-mobile.mjs`); sin ella, lo que hay
 * antes de `/m` en la ruta, con o sin barra final.
 */
function desktopBase(): string {
  const built = process.env.EXPO_PUBLIC_TERMINUS_WEB_BASE?.trim();
  if (built) return built.endsWith("/") ? built : `${built}/`;
  const path = window.location.pathname;
  const at = path.search(new RegExp(`/${MOBILE_WEB_DIR}(/|$)`));
  return at >= 0 ? `${path.slice(0, at)}/` : "/";
}

/**
 * Configuración, desde el perfil: Proveedores de IA, la memoria de cada
 * workspace, las máquinas con su estado (encendida, apagada, encendiéndose:
 * nunca un error), los registros de actividad y la conexión de desarrollo.
 * Con `section=account` es «Cuenta de Danil»: el correo, cerrar sesión y, en
 * el navegador, la versión de escritorio. Abrirla no enciende nada.
 */
export default function Settings() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { email, name, signOut, session, plane, organizations } = useAccount();
  const orgs = organizations?.state.kind === "ready" ? organizations.state : null;
  const [signOutFailed, setSignOutFailed] = useState(false);
  // Se sale solo cuando la cuenta confirma el cierre; si no, la persona sigue dentro y puede reintentar.
  const leave = async () => {
    setSignOutFailed(false);
    try {
      await signOut();
      router.dismissAll();
    } catch {
      setSignOutFailed(true);
    }
  };
  const { hosts, pairing, pair, registry } = useMachines();
  const account = section === "account";
  const power = (host: Host) =>
    host.power() === "on" ? w("web.computers.state.online") : host.power() === "starting" ? w("web.computers.state.starting") : host.power() === "outdated" ? w("web.computers.state.outdated") : w("web.computers.state.offline");
  const dot = (host: Host) => (host.power() === "on" ? theme.success : host.power() === "starting" ? theme.info : theme.border);

  return (
    <View style={{ flex: 1, backgroundColor: pageColor(theme) }}>
      <NavBar back={t("profile.title")} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <LargeTitle>{account ? w("danil.account.title") : w("settings.title")}</LargeTitle>
        {account ? (
          <>
            <Group>
              {session ? <ListRow title={email ?? name ?? ""} subtitle={t("account.title")} /> : null}
              {session ? (
                <ListRow testID="sign-out" title={t("account.sign_out")} destructive onPress={() => void leave()} />
              ) : (
                <ListRow testID="sign-in" title={t("signin.title")} chevron onPress={() => router.push("/signin")} />
              )}
            </Group>
            {signOutFailed ? <GroupFooter>{w("web.platform.unavailable")}</GroupFooter> : null}
            {session && orgs && orgs.items.length ? (
              <>
                <GroupHeader>{w("shell.organization.title")}</GroupHeader>
                <Group>
                  {orgs.items.map((org) => (
                    <ListRow
                      key={org.id}
                      testID={`organization-${org.id}`}
                      title={org.name}
                      disabled={orgs.busy}
                      onPress={orgs.items.length > 1 ? () => organizations?.choose(org.id) : undefined}
                      right={org.id === orgs.active ? <Icon name="check" size={18} color={theme.merged} /> : <View style={{ width: 18 }} />}
                    />
                  ))}
                </Group>
                {orgs.error ? <GroupFooter>{w("shell.organization.error")}</GroupFooter> : null}
              </>
            ) : null}
            {Platform.OS === "web" ? (
              <>
                <View style={{ height: 20 }} />
                <Group>
                  <ListRow testID="desktop-layout" title={t("web.desktop_layout")} chevron onPress={() => { localStorage.setItem(WEB_LAYOUT_KEY, "desktop"); window.location.assign(desktopBase()); }} />
                </Group>
              </>
            ) : null}
          </>
        ) : (
          <>
            {hosts.length ? (
              <Group inset={56}>
                <ListRow testID="open-accounts" icon={{ name: "key-round", color: "#f59e0b" }} title={w("settings.nav.ai_providers")} subtitle={t("accounts.subtitle")} chevron onPress={() => router.push("/accounts")} />
                <ListRow testID="open-activity" icon={{ name: "terminal", color: "#334155" }} title={t("activity.title")} subtitle={t("activity.description")} chevron onPress={() => router.push("/activity")} />
              </Group>
            ) : null}
            {session && registry?.length ? (
              <>
                <GroupHeader>{t("github.title")}</GroupHeader>
                <Group inset={56}>
                  {registry.map((workspace) => (
                    <ListRow key={workspace.id} testID={`github-${workspace.id}`} icon={{ name: "key-round", color: "#24292f" }} title={`${t("github.title")} · ${workspace.name}`} subtitle={t("github.subtitle")} chevron onPress={() => router.push({ pathname: "/github/[workspace]", params: { workspace: workspace.id } })} />
                  ))}
                </Group>
              </>
            ) : null}
            {session && registry?.length ? (
              <>
                <GroupHeader>{t("memory.title")}</GroupHeader>
                <Group inset={56}>
                  {registry.map((workspace) => (
                    <ListRow
                      key={workspace.id}
                      testID={`memory-${workspace.id}`}
                      icon={{ name: "brain", color: "#ec4899" }}
                      title={t("memory.open", { name: workspace.name })}
                      subtitle={t("memory.subtitle")}
                      chevron
                      onPress={() => router.push({ pathname: "/memory/[workspace]", params: { workspace: workspace.id } })}
                    />
                  ))}
                </Group>
              </>
            ) : null}
            {hosts.length ? (
              <>
                <GroupHeader>{t("machines.title")}</GroupHeader>
                <Group inset={40}>
                  {hosts.map((host) => (
                    <ListRow
                      key={host.id}
                      testID={`machine-${host.id}`}
                      left={<Dot color={dot(host)} />}
                      title={host.label}
                      subtitle={`${power(host)} · ${host.kind === "bridge" ? t("signin.dev_bridge") : host.managed ? t("machines.managed") : t("machines.own")}`}
                    />
                  ))}
                </Group>
              </>
            ) : null}
            {BRIDGE_ENABLED ? (
              <>
                <GroupHeader>{t("you.connection")}</GroupHeader>
                <Group>
                  {pairing ? <ListRow title={pairing.url} /> : null}
                  {pairing ? (
                    <ListRow testID="disconnect" title={t("home.disconnect")} destructive onPress={() => void pair(null)} />
                  ) : (
                    <ListRow testID="connect-bridge" title={t("signin.dev_bridge")} chevron onPress={() => router.push("/pair")} />
                  )}
                </Group>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Avisos de tareas en este dispositivo (solo web). Los errores quedan en la fila. */
