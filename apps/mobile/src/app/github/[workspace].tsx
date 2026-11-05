import { disconnectGithub, githubAuthorize, githubInstallations, githubStatus, setGithubAreas, type GithubAnswer, type GithubInstallations, type GithubStatus } from "@terminus/computers";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Linking, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../../lib/account";
import { t } from "../../lib/i18n";
import { useMachines } from "../../lib/machines";
import { COMPUTERS } from "../../lib/supabase";
import { Icon } from "../../ui/Icon";
import { Group, GroupHeader, LargeTitle, ListRow, NavBar, pageColor } from "../../ui/list";
import { useTheme } from "../../ui/theme";

export default function GithubScreen() {
  const { workspace } = useLocalSearchParams<{ workspace: string }>();
  const { getToken } = useAccount();
  const { registry } = useMachines();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const source = useMemo(() => ({ endpoint: COMPUTERS, getToken }), [getToken]);
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [installs, setInstalls] = useState<GithubInstallations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const request = useRef(0);
  const value = useCallback(<T,>(answer: GithubAnswer<T>): T => {
    if (answer.kind === "ok") return answer.value;
    throw new Error(answer.kind === "unauthorized" ? "unauthorized" : answer.code ?? "failed");
  }, []);
  const load = useCallback(async () => {
    if (!workspace) return;
    const turn = ++request.current;
    try {
      const next = value(await githubStatus(source, workspace));
      const listed = next.connected ? value(await githubInstallations(source, workspace)) : null;
      if (turn !== request.current) return;
      setStatus(next); setInstalls(listed); setError(null);
      if (next.connected && next.credential?.status !== "reauthorize") setWaiting(false);
    } catch (e) {
      if (turn === request.current) setError(e instanceof Error && e.message === "unauthorized" ? t("github.signed_out") : t("github.error"));
    }
  }, [source, value, workspace]);
  useEffect(() => {
    void load();
    const sub = AppState.addEventListener("change", state => { if (state === "active") void load(); });
    const onFocus = () => void load();
    if (Platform.OS === "web") window.addEventListener("focus", onFocus);
    return () => { ++request.current; sub.remove(); if (Platform.OS === "web") window.removeEventListener("focus", onFocus); };
  }, [load]);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void load(), 3000);
    const deadline = setTimeout(() => setWaiting(false), 5 * 60 * 1000);
    return () => { clearInterval(timer); clearTimeout(deadline); };
  }, [waiting, load]);
  const run = async (action: () => Promise<void>) => {
    ++request.current;
    setBusy(true); setError(null);
    try { await action(); } catch (e) { setError(e instanceof Error && e.message === "unauthorized" ? t("github.signed_out") : t("github.error")); }
    finally { setBusy(false); }
  };
  const open = async (url: string) => { await Linking.openURL(url); };
  const connect = () => void run(async () => {
    const result = value(await githubAuthorize(source, workspace));
    setWaiting(true);
    await open(result.url);
  });
  const disconnect = () => {
    const perform = () => void run(async () => { value(await disconnectGithub(source, workspace)); setWaiting(false); await load(); });
    if (Platform.OS === "web") { if (window.confirm(t("github.disconnect_confirm"))) perform(); }
    else Alert.alert(t("github.disconnect"), t("github.disconnect_confirm"), [{ text: t("github.cancel"), style: "cancel" }, { text: t("github.disconnect"), style: "destructive", onPress: perform }]);
  };
  const credential = status?.credential;
  const toggle = (key: string, installation_id: number) => void run(async () => {
    if (!credential) return;
    const areas = credential.config.areas;
    const next = areas.some(a => a.key === key) ? areas.filter(a => a.key !== key) : [...areas, { key, installation_id, repository_ids: null }];
    value(await setGithubAreas(source, workspace, next));
    await load();
  });
  const installUrl = installs?.install_url ?? status?.install_url;
  return <View style={{ flex: 1, backgroundColor: pageColor(theme) }}>
    <NavBar back={t("github.title")} />
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
      <LargeTitle>{t("github.title")}</LargeTitle>
      <Text style={{ color: theme.textMuted, marginHorizontal: 20, marginBottom: 12 }}>{registry?.find(w => w.id === workspace)?.name}</Text>
      <Group>
        {credential ? <ListRow title={t("github.connected", { login: credential.config.login })} subtitle={credential.status === "reauthorize" ? t("github.reauthorize") : undefined} /> : null}
        {status && (!credential || credential.status === "reauthorize") ? <ListRow testID="github-connect" title={credential ? t("github.reconnect") : t("github.connect")} disabled={busy} onPress={connect} /> : null}
        {waiting ? <ListRow title={t("github.waiting")} /> : null}
        <ListRow testID="github-refresh" title={t("github.refresh")} disabled={busy} onPress={() => void run(load)} />
        {credential ? <ListRow testID="github-disconnect" title={t("github.disconnect")} destructive disabled={busy} onPress={disconnect} /> : null}
      </Group>
      {error ? <Text accessibilityRole="alert" style={{ color: theme.error, marginHorizontal: 20, marginTop: 12 }}>{error}</Text> : null}
      {credential && installs ? <>
        <GroupHeader>{t("github.accounts")}</GroupHeader>
        <Text style={{ color: theme.textMuted, marginHorizontal: 20, marginBottom: 8 }}>{t("github.accounts_help")}</Text>
        <Group>
          {installs.installations.map(i => {
            const selected = credential.config.areas.some(a => a.key === i.key);
            return <ListRow key={i.key} testID={`github-area-${i.key}`} title={i.account.login} subtitle={selected ? t("github.selected") : t("github.unselected")} right={selected ? <Icon name="check" size={18} color={theme.primary} /> : undefined} disabled={busy} onPress={() => toggle(i.key, i.installation_id)} />;
          })}
          {installs.installations.length === 0 ? <ListRow title={installs.install_pending ? t("github.pending") : t("github.empty")} /> : null}
          {installUrl ? <ListRow title={t("github.install")} chevron disabled={busy} onPress={() => void run(() => open(installUrl))} /> : null}
        </Group>
      </> : null}
    </ScrollView>
  </View>;
}
