import { accessMailto, RADIUS, TEXT } from "@terminus/design";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { Host } from "../lib/hosts";
import { w } from "../lib/i18n";
import { type Fleet, useMachines } from "../lib/machines";
import { useTheme } from "./theme";

/**
 * Lo que la persona tiene que saber de sus máquinas, siempre en tono neutro:
 * una máquina apagada no es un error. Encendiéndose, se dice; apagada, no se
 * dice nada: la lista de tareas ya enseña lo que guardó.
 */
export function MachineNote({ hosts, fleet }: { hosts: Host[]; fleet: Fleet }) {
  const theme = useTheme();
  const { reloadComputers } = useMachines();
  if (fleet === "license") return <LicenseNote />;
  const lines: string[] = [];
  if (fleet === "no_account") lines.push(w("web.computers.no_account"));
  if (fleet === "error") lines.push(w("web.computers.error"));
  if (fleet === "ok" && !hosts.length) lines.push(w("web.computers.none"));
  for (const host of hosts) {
    if (host.power() === "starting") lines.push(w("shell.machines.waking", { name: host.label }));
    else if (host.power() === "outdated") lines.push(w("web.machines.outdated_action", { name: host.label }));
  }
  if (!lines.length) return null;
  return (
    <View style={[styles.note, { backgroundColor: theme.muted }]} testID="machine-note">
      {lines.map((line) => (
        <Text key={line} style={{ color: theme.textMuted, fontSize: TEXT.ui }}>
          {line}
        </Text>
      ))}
      {fleet === "error" || fleet === "no_account" || (fleet === "ok" && !hosts.length) ? (
        <Pressable onPress={() => void reloadComputers()}>
          <Text style={{ color: theme.primary, fontWeight: "600" }}>{w("web.computers.retry")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Sin licencia. Solo la web ofrece solicitar acceso por correo: la app nativa
 * nada más lo dice y deja reintentar.
 */
function LicenseNote() {
  const theme = useTheme();
  const { retryLicense } = useMachines();
  const web = Platform.OS === "web";
  return (
    <View style={[styles.note, { backgroundColor: theme.muted }]} testID="machine-note-license">
      <Text style={{ color: theme.text, fontSize: TEXT.lead, fontWeight: "600" }}>{w("danil.license.title")}</Text>
      {web ? (
        <>
          <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{w("danil.license.body")}</Text>
          <Pressable
            testID="license-request"
            style={[styles.cta, { backgroundColor: theme.primary }]}
            onPress={() => window.location.assign(accessMailto(w("danil.license.request_subject")))}
          >
            <Text style={{ color: theme.onPrimary, fontWeight: "600" }}>{w("danil.license.request")}</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable testID="license-retry" onPress={retryLicense}>
        <Text style={{ color: theme.primary, fontWeight: "600" }}>{web ? w("danil.license.retry") : w("web.computers.retry")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { marginHorizontal: 12, marginTop: 10, padding: 10, borderRadius: 10, gap: 4 },
  cta: { alignSelf: "flex-start", marginVertical: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.lg },
});
