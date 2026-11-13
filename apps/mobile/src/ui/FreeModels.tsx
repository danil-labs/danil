import { TEXT } from "@terminus/design";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { type FreeModels as FreeRow, freeModelsOf, changeFreeModels } from "../lib/engine";
import type { Host } from "../lib/hosts";
import { phrase, t, w } from "../lib/i18n";
import { BrandMark } from "./BrandMark";
import { Sheet } from "./Sheet";
import { type Theme } from "./theme";

export type FreeRouterRow = FreeRow & { host: Host; workspace: string };
type Row = FreeRouterRow;

/** La aceptación se guarda sólo desde la hoja explícita; cancelar no cambia el workspace. */
export function FreeModels({ hosts, scopeOf, theme, tick }: { hosts: readonly Host[]; scopeOf: (host: Host) => string | null; theme: Theme; tick: unknown }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [asking, setAsking] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const asked = useRef(0);

  const load = useCallback(async () => {
    const mine = ++asked.current;
    // Abrir no enciende: solo las máquinas encendidas contestan.
    const lists = await Promise.all(
      hosts.filter((h) => h.power() === "on").map(async (host) => {
        const workspace = scopeOf(host);
        if (!workspace) return [];
        const found = await freeModelsOf(host, workspace).catch(() => [] as FreeRow[]);
        return found.map((row) => ({ ...row, host, workspace }));
      }),
    );
    if (mine === asked.current) setRows(lists.flat());
  }, [hosts, scopeOf]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  async function change(row: Row, accepted: boolean) {
    setSaving(true);
    setFailed(null);
    try {
      // Lo que quedó guardado, no lo pedido.
      const refreshed = await changeFreeModels(row.host, row.workspace, row, accepted);
      setRows((now) => [...now.filter((r) => r.host.id !== row.host.id || r.workspace !== row.workspace), ...refreshed.map((r) => ({ ...r, host: row.host, workspace: row.workspace }))]);
      setAsking(null);
      void load();
    } catch {
      setFailed(`${row.host.id}/${row.provider}`);
    } finally {
      setSaving(false);
    }
  }

  if (!rows.length) return null;

  return (
    <View style={styles.section} testID="free-models">
      <View style={styles.head}>
        <BrandMark id="danil" size={18} color={theme.text} />
        <Text style={[styles.title, { color: theme.text }]}>{t("composer.free_models")}</Text>
        <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{w("settings.ai_providers.free_detail")}</Text>
      </View>
      {rows.map((row) => {
        const id = `${row.host.id}/${row.provider}`;
        return (
          <View key={id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]} testID={`free-${id}`}>
            <Text style={{ color: theme.text, fontSize: TEXT.lead, fontWeight: "600" }}>{row.host.label}</Text>
            {row.accepted ? (
              <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{w("settings.accounts.free.warning_short")}</Text>
            ) : (
              <>
                <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{w("settings.accounts.free.provider", { provider: w("settings.ai_providers.free_detail") })}</Text>
                <Text style={{ color: theme.text, fontSize: TEXT.ui, fontWeight: "600" }}>{w("settings.accounts.free.warning")}</Text>
              </>
            )}
            {failed === id ? <Text accessibilityRole="alert" style={{ color: theme.error, fontSize: TEXT.ui }}>{w("settings.accounts.free.error_save")}</Text> : null}
            {row.accepted ? (
              <View style={styles.row}>
                <Text style={{ color: row.usable ? theme.success : theme.textMuted, fontSize: TEXT.ui, fontWeight: "600" }}>{t(row.usable ? "accounts.free_available" : "accounts.free_route_unavailable")}</Text>
                <Pressable
                  testID={`free-off-${id}`}
                  accessibilityRole="button"
                  accessibilityHint={w("settings.accounts.free.deactivate_title")}
                  disabled={saving}
                  onPress={() => void change(row, false)}
                  style={[styles.button, { borderColor: theme.border, borderWidth: 1, opacity: saving ? 0.5 : 1 }]}
                >
                  <Text style={{ color: theme.text, fontWeight: "600" }}>{w("settings.accounts.free.deactivate")}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                testID={`free-on-${id}`}
                accessibilityRole="button"
                disabled={saving || !row.policy?.enabled}
                onPress={() => setAsking(row)}
                style={[styles.button, { backgroundColor: theme.primary, alignSelf: "flex-start", opacity: saving ? 0.5 : 1 }]}
              >
                <Text style={{ color: theme.onPrimary, fontWeight: "600" }}>{w("settings.accounts.free.activate")}</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      <FreeConsentSheet
        row={asking}
        theme={theme}
        onClose={() => setAsking(null)}
        onSaved={(row, refreshed) => {
          setRows((now) => [...now.filter((r) => r.host.id !== row.host.id || r.workspace !== row.workspace), ...refreshed.map((r) => ({ ...r, host: row.host, workspace: row.workspace }))]);
          setAsking(null);
          void load();
        }}
      />
    </View>
  );
}

/** La hoja del sí explícito; la usan Ajustes y el selector de modelos. Su error se queda dentro de la hoja. */
export function FreeConsentSheet({ row, theme, onClose, onSaved }: { row: FreeRouterRow | null; theme: Theme; onClose: () => void; onSaved: (row: FreeRouterRow, refreshed: FreeRow[]) => void }) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState<FreeRouterRow | null>(row);
  useEffect(() => { setFailed(false); setCurrent(row); }, [row]);
  const asking = row ? current : null;

  async function accept(row: FreeRouterRow) {
    setSaving(true);
    setFailed(false);
    try {
      // Lo que quedó guardado, no lo pedido.
      onSaved(row, await changeFreeModels(row.host, row.workspace, row, true));
    } catch {
      setFailed(true);
      // Con la política cambiada se relee y se pide confirmar de nuevo sobre el texto vigente.
      const fresh = await freeModelsOf(row.host, row.workspace).catch(() => [] as FreeRow[]);
      const same = fresh.find((r) => r.provider === row.provider);
      if (same) setCurrent({ ...same, host: row.host, workspace: row.workspace });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Cancelar cierra y no activa nada, por cualquier vía: el sí solo existe si se pulsa Activar. */}
      <Sheet visible={asking !== null} title={w("settings.accounts.consent.title")} onClose={onClose}>
        {asking ? (
          <View style={styles.consent} testID="free-consent">
            {asking.text.lines.map((line, i) => (
              <Text key={i} style={{ color: i === 0 ? theme.text : theme.textMuted, fontSize: TEXT.body, lineHeight: 20, fontWeight: i === 0 ? "600" : "400" }}>
                {phrase(line)}
              </Text>
            ))}
            {asking.policy?.terms.map((term) => (
              <Pressable key={term.url} accessibilityRole="link" onPress={() => void Linking.openURL(term.url)}>
                <Text style={{ color: theme.primary }}>{term.label}</Text>
              </Pressable>
            ))}
            {failed ? <Text accessibilityRole="alert" style={{ color: theme.error }}>{w("settings.accounts.free.error_save")}</Text> : null}
            <View style={styles.row}>
              <Pressable testID="free-consent-cancel" accessibilityRole="button" disabled={saving} onPress={onClose} style={[styles.button, { borderColor: theme.border, borderWidth: 1 }]}>
                <Text style={{ color: theme.text, fontWeight: "600" }}>{w("settings.accounts.consent.cancel")}</Text>
              </Pressable>
              <Pressable testID="free-consent-accept" accessibilityRole="button" disabled={saving} onPress={() => void accept(asking)} style={[styles.button, { backgroundColor: theme.primary, opacity: saving ? 0.5 : 1 }]}>
                <Text style={{ color: theme.onPrimary, fontWeight: "600" }}>{w("settings.accounts.consent.accept")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingTop: 6, flexWrap: "wrap" },
  title: { fontSize: 17, fontWeight: "700" },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  button: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  consent: { paddingHorizontal: 18, gap: 12, paddingBottom: 8 },
});
