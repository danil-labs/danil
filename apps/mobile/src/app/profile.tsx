import { RADIUS, TEXT } from "@terminus/design";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../lib/account";
import { setThemeChoice, useThemeChoice } from "../lib/appearance";
import { failureText } from "../lib/engine";
import type { Host } from "../lib/hosts";
import { useHomeLabel } from "../lib/homeLabel";
import { t, w } from "../lib/i18n";
import { useMachines } from "../lib/machines";
import { type KeepAwakeMode, type KeepAwakeStatus, keepAwakeOf, type OpenPorts, portsOf, ready, setKeepAwake } from "../lib/pending";
import { useWorkspaces } from "../lib/workspaces";
import { Group, GroupFooter, GroupHeader, ListRow, NavBar, pageColor, Segmented } from "../ui/list";
import { Sheet } from "../ui/Sheet";
import { useTheme } from "../ui/theme";

const initials = (text: string | null | undefined) =>
  (text ?? "").split(/[@\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";

/**
 * El menú de perfil, desde el avatar de Inicio: la cuenta y Cuenta de Danil;
 * Tema; Mantener despierta la computadora (cuando el teléfono pueda mandarlo);
 * Configuración, Puertos y Almacenamiento. Mantener despierta y Puertos
 * hablan con la primera máquina del workspace y no se ven mientras sus
 * comandos no estén en la lista cerrada (`ready` en `lib/pending.ts`).
 */
export default function Profile() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const back = useHomeLabel();
  const { email, name, organizations } = useAccount();
  const org = organizations?.state.kind === "ready" ? organizations.state.items.find((o) => o.id === (organizations.state as { active: string | null }).active) : undefined;
  const handle = name ?? email?.split("@")[0] ?? null;
  const { hostOf } = useMachines();
  const { current } = useWorkspaces();
  const choice = useThemeChoice();
  const first = current ? [...current.members.keys()].map(hostOf).find((host): host is Host => !!host) ?? null : null;
  const workspace = first && current ? current.members.get(first.id) ?? null : null;
  const reachable = first?.power() === "on";
  const [awake, setAwake] = useState<KeepAwakeStatus | null>(null);
  const [ports, setPorts] = useState<OpenPorts | null>(null);
  const [portsOpen, setPortsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!first || !workspace || !reachable) return;
    let live = true;
    if (ready("keep_awake", first)) void keepAwakeOf(first, workspace).then((value) => { if (live) setAwake(value); }, () => {});
    if (ready("ports", first)) void portsOf(first, workspace).then((value) => { if (live) setPorts(value); }, () => {});
    return () => { live = false; };
  }, [first, workspace, reachable]);

  const chooseAwake = async (mode: KeepAwakeMode) => {
    if (!first || !workspace) return;
    setError(null);
    try {
      setAwake(await setKeepAwake(first, workspace, mode));
    } catch (cause) {
      setError(failureText(cause));
    }
  };
  const portList = ports ? [...ports.tareas.flatMap((task) => task.puertos), ...ports.externos] : [];

  return (
    <View style={{ flex: 1, backgroundColor: pageColor(theme) }}>
      <NavBar back={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <View style={styles.me}>
          <View style={[styles.avatar, { backgroundColor: theme.merged }]}>
            <Text style={styles.avatarText}>{initials(email ?? name)}</Text>
          </View>
          <Text style={[styles.name, { color: theme.text }]}>{handle ?? w("common.brand_name")}</Text>
          {email ? <Text style={{ color: theme.textMuted, fontSize: TEXT.lead }}>{email}</Text> : null}
          {org ? <Text testID="profile-organization" style={{ color: theme.textMuted, fontSize: TEXT.lead }}>{org.name}</Text> : null}
        </View>

        <Group inset={56}>
          <ListRow testID="danil-account" icon={{ name: "circle-user-round", color: theme.dark ? "#3f3f46" : "#0a0d23" }} title={w("danil.account.title")} chevron onPress={() => router.push({ pathname: "/settings", params: { section: "account" } })} />
        </Group>

        <GroupHeader>{w("shell.profile.theme")}</GroupHeader>
        <View style={[styles.segmentCard, { backgroundColor: theme.surface }]}>
          <Segmented
            testID="theme"
            style={{ marginHorizontal: 6 }}
            value={choice}
            onChange={setThemeChoice}
            options={[
              { value: "light", label: w("shell.theme.name.light"), icon: "sun" },
              { value: "dark", label: w("shell.theme.name.dark"), icon: "moon" },
              { value: "system", label: w("shell.theme.name.system"), icon: "monitor" },
            ]}
          />
        </View>

        {ready("keep_awake", first) && awake?.supported ? (
          <>
            <GroupHeader right={
              <View style={styles.state}>
                <View style={[styles.dot, { backgroundColor: awake.active ? theme.approving : theme.border }]} />
                <Text style={{ color: theme.textMuted, fontSize: 12.5 }}>{w(awake.active ? "shell.keep_awake.active" : "shell.keep_awake.inactive")}</Text>
              </View>
            }>
              {w("shell.keep_awake.title")}
            </GroupHeader>
            <View style={[styles.segmentCard, { backgroundColor: theme.surface }]}>
              <Segmented
                testID="keep-awake"
                style={{ marginHorizontal: 6 }}
                value={awake.mode}
                onChange={(mode) => void chooseAwake(mode)}
                options={[
                  { value: "on", label: w("shell.keep_awake.on") },
                  { value: "agent", label: w("shell.keep_awake.agent") },
                  { value: "off", label: w("shell.keep_awake.off") },
                ]}
              />
            </View>
            <GroupFooter>{w(awake.mode === "on" ? "shell.keep_awake.on.description" : awake.mode === "agent" ? "shell.keep_awake.agent.description" : "shell.keep_awake.off.description")}</GroupFooter>
          </>
        ) : null}
        {error ? <GroupFooter>{error}</GroupFooter> : null}

        <View style={{ height: 20 }} />
        <Group inset={56}>
          <ListRow testID="settings" icon={{ name: "settings", color: "#64748b" }} title={w("settings.title")} chevron onPress={() => router.push("/settings")} />
          {ready("ports", first) && ports ? (
            <ListRow testID="ports" icon={{ name: "plug", color: "#0ea5e9" }} title={w("shell.ports.title")} value={String(portList.length)} chevron onPress={() => setPortsOpen(true)} />
          ) : null}
          <ListRow testID="storage" icon={{ name: "hard-drive", color: "#8b5cf6" }} title={t("storage.title")} chevron onPress={() => router.push({ pathname: "/accounts", params: { storage: "1" } })} />
        </Group>
      </ScrollView>

      <Sheet visible={portsOpen} title={w("shell.ports.title")} onClose={() => setPortsOpen(false)}>
        <View style={{ paddingBottom: 8 }}>
          {ports?.aviso ? <Text style={{ color: theme.textMuted, paddingHorizontal: 20 }}>{ports.aviso}</Text> : null}
          {portList.map((port) => (
            <ListRow key={port.id} title={`:${port.puerto}`} subtitle={port.comando} value={port.direccion} onPress={() => void Linking.openURL(port.url)} />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  me: { alignItems: "center", gap: 4, paddingTop: 8, paddingBottom: 20 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  avatarText: { color: "#ffffff", fontSize: 28, fontWeight: "700" },
  name: { fontSize: 22, fontWeight: "800" },
  state: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: 8 },
  dot: { width: 8, height: 8, borderRadius: RADIUS.sm },
  segmentCard: { marginHorizontal: 16, borderRadius: 14, paddingVertical: 6 },
});
