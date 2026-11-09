import { RADIUS, TEXT } from "@terminus/design";
import { useLocalSearchParams } from "expo-router";
import { providerUsage } from "../lib/accountUsage";
import { type AccountGroup, usageTone, windowLabel, windowLeft } from "@terminus/computers";
import type { AccountLimits, AiAccount, LoginEvent, ProviderInfo, UsageWindow } from "@terminus/protocol";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LOGIN_START, type LoginProgress, accountWorkspace, addAccount, beginLogin, cancelLogin, failureText, loginStep, signOutAccount, submitLoginCode } from "../lib/engine";
import { type Host, HostError } from "../lib/hosts";
import { lang, t, w } from "../lib/i18n";
import { useMachines } from "../lib/machines";
import { useWorkspaces } from "../lib/workspaces";
import { BrandMark } from "../ui/BrandMark";
import { Dot } from "../ui/components";
import { FreeModels } from "../ui/FreeModels";
import { Icon } from "../ui/Icon";
import { MachineStorage } from "../ui/MachineStorage";
import { Sheet, SheetOption } from "../ui/Sheet";
import { type Theme, useTheme } from "../ui/theme";

type ProviderAccounts = { provider: ProviderInfo; groups: AccountGroup<AiAccount>[]; limits: Record<string, AccountLimits | null>; cachedAt: Record<string, number | null> };
/** `workspace`: el de las llamadas de cuentas a esa máquina (`accountWorkspace`). */
type Login = LoginProgress & { host: Host; workspace: string | null; provider: ProviderInfo; id: string | null };

/**
 * Proveedores de IA: las cuentas de la persona en todas sus máquinas, como el
 * panel de la web (#154). Una tarjeta por proveedor, correo y tipo con su consumo
 * (leído una vez, de una máquina encendida) y una chapa por máquina donde
 * tiene la sesión iniciada: encendida o apagada (neutra), con su ✕ para
 * cerrarla. «Iniciar sesión en otra máquina» corre el inicio sin pantalla de
 * esa máquina: enlace y código, por eventos `account`. Abrir esta pantalla no
 * enciende nada; iniciar o cerrar sesión encienden la VM si está apagada.
 * Las cuentas del motor son de un workspace: cada llamada lleva el abierto en
 * el teléfono, o el de esa máquina si no lo tiene (`accountWorkspace`).
 */
export default function Accounts() {
  const theme = useTheme();
  const { hosts, subscribe, tick } = useMachines();
  const { current } = useWorkspaces();
  const currentId = current?.id ?? null;
  const scopeOf = useCallback((host: Host) => accountWorkspace(host, currentId), [currentId]);
  const [data, setData] = useState<ProviderAccounts[] | null>(null);
  // Desde «Almacenamiento» del perfil llega abierto.
  const { storage } = useLocalSearchParams<{ storage?: string }>();
  const [storageOpen, setStorageOpen] = useState(storage === "1");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState<{ provider: ProviderInfo; exclude: string[] } | null>(null);
  const [login, setLogin] = useState<Login | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const loginRef = useRef<Login | null>(null);
  loginRef.current = login;
  const asked = useRef(0);

  const load = useCallback(async () => {
    const mine = ++asked.current;
    setLoading(true);
    setFailed(false);
    try {
      // Los proveedores con los que se trabaja (Codex, Claude…), de cualquier máquina que conteste.
      const lists = await Promise.all(hosts.map((h) => h.call<ProviderInfo[]>("list_providers", null, {}).then((a) => a.value ?? []).catch(() => [] as ProviderInfo[])));
      const providers = new Map<string, ProviderInfo>();
      for (const list of lists) for (const p of list) if (p.driver && !providers.has(p.id)) providers.set(p.id, p);
      const result = await Promise.all(
        [...providers.values()].map(async (provider) => {
          const { groups, limits, cachedAt } = await providerUsage(hosts, provider.id, scopeOf);
          return { provider, groups, limits, cachedAt };
        }),
      );
      if (mine === asked.current) {
        setData(result);
        setFailed(!result.length && hosts.some((host) => host.power() === "on"));
      }
    } catch {
      if (mine === asked.current) setFailed(true);
    } finally {
      if (mine === asked.current) setLoading(false);
    }
  }, [hosts, scopeOf]);

  // Al entrar y cuando una máquina cambia de estado (se encendió para iniciar sesión, se apagó).
  useEffect(() => {
    void load();
  }, [load, tick]);

  useEffect(() => {
    const retries = (data ?? []).flatMap((entry) => Object.values(entry.limits)).flatMap((limit) => limit?.mode === "waiting" ? [limit.retry_at] : []);
    if (!retries.length) return;
    const delay = Math.max(5000, Math.min(...retries) - Date.now());
    const timer = setTimeout(() => void load(), Math.min(delay, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [data, load]);

  // Los eventos del inicio de sesión de la máquina elegida.
  useEffect(
    () =>
      subscribe((from, events) => {
        const current = loginRef.current;
        if (!current || from !== current.host.id || !current.id) return;
        for (const event of events) {
          if (event.name !== "account") continue;
          const e = event.payload as LoginEvent;
          if (e.account !== current.id) continue;
          setLogin((old) => (old ? loginStep(old, e) : old));
          if (e.kind === "url" && e.text) void WebBrowser.openBrowserAsync(e.text).catch(() => {});
          if (e.kind === "done" && !e.text) void load();
        }
      }),
    [subscribe, load],
  );

  async function startOn(host: Host, provider: ProviderInfo) {
    setPick(null);
    setCode("");
    setCopied(false);
    const workspace = scopeOf(host);
    const next: Login = { ...LOGIN_START, host, workspace, provider, id: null };
    setLogin(next);
    if (!workspace && host.linked !== null) {
      setLogin((old) => (old ? { ...old, error: t("accounts.no_workspace", { name: host.label }), done: true } : old));
      return;
    }
    try {
      const id = await addAccount(host, workspace, provider.id);
      setLogin((old) => (old ? { ...old, id } : old));
      loginRef.current = { ...next, id };
      await beginLogin(host, workspace, provider.id, id);
    } catch (error) {
      setLogin((old) => (old ? { ...old, error: failure(error, host), done: true } : old));
    }
  }

  async function closeLogin() {
    const current = login;
    setLogin(null);
    // A medias o fallido: se corta el CLI y la cuenta vacía no se queda (`discard_account` no borra una autenticada).
    if (current?.id && (!current.done || current.error)) await cancelLogin(current.host, current.workspace, current.provider.id, current.id);
  }

  function signOut(group: AccountGroup<AiAccount>, provider: ProviderInfo, member: { machine: string; id: string }) {
    const host = hosts.find((h) => h.id === member.machine);
    if (!host) return;
    const account = group.row.identity || group.row.label;
    Alert.alert(w("web.accounts.sign_out", { name: host.label }), t("accounts.sign_out_confirm", { account, name: host.label, provider: provider.label }), [
      { text: w("web.accounts.sign_out_no"), style: "cancel" },
      {
        text: w("web.accounts.sign_out_yes"),
        style: "destructive",
        onPress: () =>
          void signOutAccount(host, scopeOf(host), provider.id, member.id)
            .then(load)
            .catch(() => Alert.alert(w("web.accounts.sign_out_failed"))),
      },
    ]);
  }

  const offHosts = hosts.filter((h) => h.power() !== "on");
  const candidates = (exclude: string[]) => hosts.filter((h) => !exclude.includes(h.id) && h.power() !== "outdated" && h.canAct() !== "asleep");

  return (
    <>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: storageOpen }} onPress={() => setStorageOpen((open) => !open)} style={{ minHeight: 48, justifyContent: "center" }} testID="storage-toggle">
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "600" }}>{t("storage.title")}</Text>
          <Text style={{ color: theme.textMuted }}>{t("storage.subtitle")}</Text>
        </Pressable>
        {storageOpen ? <MachineStorage hosts={hosts} workspace={currentId} theme={theme} /> : null}
        <Text style={{ color: theme.textMuted, paddingHorizontal: 4 }}>{t("accounts.subtitle")}</Text>
        {failed ? <Text accessibilityRole="alert" style={{ color: theme.error }}>{t("accounts.load_failed")}</Text> : null}
        {offHosts.map((h) => (
          <Text key={h.id} style={[styles.note, { color: theme.textMuted, backgroundColor: theme.muted }]}>
            {t("accounts.machine_off", { name: h.label })}
          </Text>
        ))}
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: "600" }}>Danil</Text>
        <FreeModels hosts={hosts} scopeOf={scopeOf} theme={theme} tick={tick} />
        {data?.map(({ provider, groups, limits, cachedAt }) => (
          <View key={provider.id} style={styles.provider} testID={`provider-${provider.id}`}>
            <View style={styles.providerHead}>
              <BrandMark id={provider.id} size={18} color={theme.text} />
              <Text style={[styles.providerName, { color: theme.text }]}>{provider.label}</Text>
            </View>
            {!groups.length ? <Text style={{ color: theme.textMuted, paddingHorizontal: 4 }}>{t("accounts.empty", { provider: provider.label })}</Text> : null}
            {groups.map((g) => {
              const others = candidates(g.members.map((m) => m.machine));
              const nameOf = (id: string) => hosts.find((h) => h.id === id)?.label ?? id;
              const title = g.email ?? `${g.row.label || g.row.id} · ${nameOf(g.members[0].machine)}`;
              return (
                <View key={g.key} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]} testID={`account-${g.key}`}>
                  <View style={styles.cardHead}>
                    <Text numberOfLines={1} style={[styles.accountName, { color: theme.text }]}>{title}</Text>
                    <Plan limits={limits[g.key]} theme={theme} />
                  </View>
                  <Usage limits={limits[g.key]} signedIn={Boolean(g.row.authenticated_at)} theme={theme} />
                  {cachedAt[g.key] ? <Text style={{ color: theme.textMuted, fontSize: TEXT.label }}>{t("accounts.cached", { time: new Date(cachedAt[g.key]!).toLocaleString() })}</Text> : null}
                  <View style={styles.chips}>
                    {g.members.map((m) => {
                      const host = hosts.find((h) => h.id === m.machine);
                      const on = host?.power() === "on";
                      return (
                        <View key={`${m.machine}~${m.id}`} style={[styles.chip, { borderColor: theme.border }]} testID={`chip-${m.machine}`}>
                          <Dot color={on ? theme.success : theme.border} />
                          <Text numberOfLines={1} style={{ color: theme.text, fontSize: TEXT.ui, maxWidth: 150 }} accessibilityLabel={`${nameOf(m.machine)} · ${on ? w("web.computers.state.online") : w("web.computers.state.offline")}`}>
                            {nameOf(m.machine)}
                          </Text>
                          <Pressable hitSlop={10} accessibilityLabel={w("web.accounts.sign_out", { name: nameOf(m.machine) })} onPress={() => signOut(g, provider, m)} testID={`sign-out-${m.machine}`}>
                            <Icon name="x" size={14} color={theme.textMuted} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                  {others.length ? (
                    <Pressable style={styles.link} onPress={() => setPick({ provider, exclude: g.members.map((m) => m.machine) })} testID={`sign-in-elsewhere-${g.key}`}>
                      <Icon name="plus" size={14} color={theme.primary} />
                      <Text style={{ color: theme.primary, fontWeight: "600" }}>{w("web.accounts.sign_in_elsewhere")}</Text>
                    </Pressable>
                  ) : hosts.length > 1 ? (
                    <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{t("accounts.all_signed_in")}</Text>
                  ) : null}
                </View>
              );
            })}
            <Pressable style={styles.link} onPress={() => setPick({ provider, exclude: [] })} testID={`connect-${provider.id}`}>
              <Text style={{ color: theme.textMuted, fontWeight: "600" }}>{w("settings.accounts.add")}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <Sheet visible={pick !== null} title={t("accounts.pick_machine")} onClose={() => setPick(null)}>
        {pick
          ? candidates(pick.exclude).map((h) => (
              <SheetOption
                key={h.id}
                testID={`login-on-${h.id}`}
                icon="server"
                label={h.label}
                detail={h.power() === "on" ? w("web.computers.state.online") : h.power() === "starting" ? w("web.computers.state.starting") : w("web.computers.state.offline")}
                onPress={() => void startOn(h, pick.provider)}
              />
            ))
          : null}
      </Sheet>

      <Sheet visible={login !== null} title={login ? `${login.provider.label} · ${login.host.label}` : undefined} onClose={() => void closeLogin()}>
        {login ? (
          <View style={styles.login} testID="login-flow">
            {login.error ? (
              <Text style={{ color: theme.text }} testID="login-error">{t("accounts.failed", { detail: login.error })}</Text>
            ) : login.done ? (
              <Text style={{ color: theme.text }}>{t("accounts.connected", { name: login.host.label })}</Text>
            ) : !login.url && !login.confirm && !login.askCode ? (
              <Text style={{ color: theme.textMuted }}>
                {login.host.power() !== "on" ? w("shell.machines.waking", { name: login.host.label }) : t("accounts.opening", { provider: login.provider.label })}
              </Text>
            ) : null}
            {!login.done && login.url ? (
              <>
                <Text style={[styles.step, { color: theme.text }]} testID="login-open">{t("accounts.open_login", { provider: login.provider.label })}</Text>
                <View style={styles.row}>
                  <Pressable testID="login-reopen" style={[styles.button, { backgroundColor: theme.primary }]} onPress={() => void WebBrowser.openBrowserAsync(login.url!)}>
                    <Icon name="external-link" size={15} color={theme.onPrimary} />
                    <Text style={{ color: theme.onPrimary, fontWeight: "600" }}>{t("accounts.reopen")}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, { borderColor: theme.border, borderWidth: 1 }]}
                    onPress={() => void Clipboard.setStringAsync(login.url!).then(() => setCopied(true))}
                  >
                    <Icon name="copy" size={15} color={theme.text} />
                    <Text style={{ color: theme.text, fontWeight: "600" }}>{copied ? w("settings.accounts.link_copied") : w("settings.accounts.copy_link")}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
            {!login.done && login.confirm ? (
              <>
                <Text style={{ color: theme.textMuted }}>{w("settings.accounts.confirm_code")}</Text>
                <Text selectable style={[styles.code, { color: theme.text, backgroundColor: theme.muted }]} testID="login-confirm">
                  {login.confirm}
                </Text>
              </>
            ) : null}
            {!login.done && login.askCode ? (
              <>
                <Text style={[styles.step, { color: theme.text }]}>{w("settings.accounts.step_code")}</Text>
                <TextInput
                  testID="login-code"
                  value={code}
                  onChangeText={setCode}
                  placeholder={w("settings.accounts.code_placeholder")}
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
                />
                <Pressable
                  testID="login-send-code"
                  disabled={!code.trim() || !login.id}
                  onPress={() =>
                    login.id &&
                    void submitLoginCode(login.host, login.workspace, login.id, code.trim())
                      .then(() => setLogin((old) => (old ? { ...old, askCode: false, notice: null } : old)))
                      .catch(() => setLogin((old) => (old ? { ...old, error: w("settings.accounts.error.code"), done: true } : old)))
                  }
                  style={[styles.button, { backgroundColor: theme.primary, opacity: code.trim() ? 1 : 0.5, alignSelf: "flex-start" }]}
                >
                  <Text style={{ color: theme.onPrimary, fontWeight: "600" }}>{w("settings.accounts.send_code")}</Text>
                </Pressable>
              </>
            ) : null}
            {!login.done && (login.url || login.confirm) && !login.askCode ? (
              <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{t("accounts.waiting", { provider: login.provider.label })}</Text>
            ) : null}
            <Pressable onPress={() => void closeLogin()} style={{ alignSelf: "flex-start", paddingVertical: 6 }}>
              <Text style={{ color: theme.textMuted, fontWeight: "600" }}>{login.done ? t("accounts.close") : w("settings.accounts.cancel")}</Text>
            </Pressable>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

function failure(error: unknown, host: Host) {
  if (error instanceof HostError && error.code === "machine_asleep") return w("web.machines.off_action", { name: host.label });
  if (error instanceof HostError && error.code === "machine_outdated") return w("web.machines.outdated_action", { name: host.label });
  if (error instanceof HostError && (error.code === "start_failed" || error.code === "start_timeout")) return t("machines.start_failed", { name: host.label });
  if (error instanceof HostError && error.code === "workspace_mismatch") return t("accounts.workspace_mismatch", { name: host.label });
  if (error instanceof HostError && error.code === "workspace_not_linked") return t("accounts.not_linked", { name: host.label });
  if (error instanceof HostError && (error.code === "machine_timeout" || error.code === "machine_lost")) return t("accounts.no_answer", { name: host.label });
  // La frase del motor (`command_failed` trae la suya); sin frase, el código, nunca el nombre de la máquina.
  const text = failureText(error);
  return error instanceof HostError && text === host.label ? error.code : text;
}

function windowsOf(limits: AccountLimits | null | undefined): UsageWindow[] {
  if (!limits) return [];
  if (limits.mode === "read") return limits.windows;
  if (limits.mode === "waiting") return limits.last?.windows ?? [];
  return [];
}

function Plan({ limits, theme }: { limits: AccountLimits | null | undefined; theme: Theme }) {
  const plan = limits?.mode === "read" ? limits.plan : limits?.mode === "waiting" ? limits.last?.plan : null;
  if (!plan) return null;
  return <Text style={{ color: theme.textMuted, fontSize: TEXT.label }}>{plan}</Text>;
}

/** Las ventanas de consumo: lo que queda y cuándo vuelve, con la barra del escritorio. */
function Usage({ limits, signedIn, theme }: { limits: AccountLimits | null | undefined; signedIn: boolean; theme: Theme }) {
  if (!signedIn) return <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{w("settings.account_card.disconnected")}</Text>;
  if (limits?.mode === "in_use") return <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{w("settings.account_card.in_use")}</Text>;
  const windows = windowsOf(limits);
  if (!windows.length && limits?.mode === "waiting") return <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{t("accounts.usage_waiting")}</Text>;
  if (!windows.length && (limits?.mode === "failed" || limits?.mode === "revoked")) return <Text style={{ color: theme.error, fontSize: TEXT.ui }}>{t("accounts.usage_failed")}</Text>;
  if (!windows.length) return <Text style={{ color: theme.textMuted, fontSize: TEXT.ui }}>{limits ? w("settings.account_card.not_asked") : t("accounts.no_usage")}</Text>;
  return (
    <View style={{ gap: 8 }}>
      {windows.map((win) => {
        const left = windowLeft(win);
        const tone = usageTone(left);
        const color = tone === "error" ? theme.error : tone === "warning" ? theme.approving : theme.textMuted;
        return (
          <View key={win.label} style={{ gap: 4 }}>
            <View style={styles.windowHead}>
              <Text style={{ color: theme.text, fontSize: TEXT.ui }}>{win.label}</Text>
              <Text style={{ color: theme.textMuted, fontSize: TEXT.ui, fontVariant: ["tabular-nums"] }}>{windowLabel(lang, win)}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: theme.muted }]}>
              <View style={[styles.fill, { width: `${left}%`, backgroundColor: color }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 12, gap: 14, paddingBottom: 40 },
  note: { padding: 10, borderRadius: 10, fontSize: TEXT.ui },
  provider: { gap: 8 },
  providerHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingTop: 6 },
  providerName: { fontSize: 17, fontWeight: "700" },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  accountName: { flex: 1, fontSize: TEXT.lead, fontWeight: "600" },
  windowHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  track: { height: 5, borderRadius: 3, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: RADIUS.lg, paddingLeft: 8, paddingRight: 6, paddingVertical: 5 },
  link: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 4 },
  login: { paddingHorizontal: 18, gap: 12, paddingBottom: 8 },
  step: { fontSize: TEXT.lead, fontWeight: "600" },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  button: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  code: { fontSize: 26, fontWeight: "700", letterSpacing: 3, textAlign: "center", paddingVertical: 12, borderRadius: 10, fontVariant: ["tabular-nums"] },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
