import type { PushMode, PushPreferences } from "@terminus/computers";
import { MOBILE_WEB_DIR, WEB_LAYOUT_KEY } from "@terminus/design";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../lib/account";
import { BRIDGE_ENABLED } from "../lib/bridge";
import type { Host } from "../lib/hosts";
import { t, w } from "../lib/i18n";
import { useMachines } from "../lib/machines";
import { disablePush, enablePush, PUSH_IOS, PUSH_TEST, type PushState, pushState, readPushPrefs, sendTestPush, writePushPrefs } from "../lib/push";
import { Dot } from "../ui/components";
import { Icon } from "../ui/Icon";
import { Group, GroupHeader, LargeTitle, ListRow, NavBar, pageColor } from "../ui/list";
import { Sheet, SheetOption } from "../ui/Sheet";
import { useTheme } from "../ui/theme";

/** `1260` → `21:00`. */
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Ventanas que se ofrecen; la persona elige una, no escribe horas. */
const QUIET_PRESETS = [
  { from: 20 * 60, to: 8 * 60 },
  { from: 21 * 60, to: 8 * 60 },
  { from: 22 * 60, to: 7 * 60 },
  { from: 23 * 60, to: 6 * 60 },
];

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
  const { email, signOut, session, getToken } = useAccount();
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
              {session ? <ListRow title={email ?? ""} subtitle={t("account.title")} /> : null}
              {session ? (
                <ListRow testID="sign-out" title={t("account.sign_out")} destructive onPress={() => { router.dismissAll(); void disablePush(getToken).finally(signOut); }} />
              ) : (
                <ListRow testID="sign-in" title={t("signin.title")} chevron onPress={() => router.push("/signin")} />
              )}
            </Group>
            {Platform.OS === "web" ? (
              <>
                <View style={{ height: 20 }} />
                {session ? <PushRow getToken={getToken} /> : null}
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
function PushRow({ getToken }: { getToken: () => Promise<string> }) {
  const theme = useTheme();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PushPreferences | null>(null);
  const [quietSheet, setQuietSheet] = useState(false);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  useEffect(() => {
    if (!state?.on) {
      setPrefs(null);
      return;
    }
    void readPushPrefs(getToken).then(setPrefs).catch(() => setPrefs({ mode: "all", quiet: null }));
  }, [state?.on, getToken]);
  if (!state || (!state.supported && !state.needsInstall)) return null;
  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setNote(null);
    try {
      setNote(await action());
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      // El build de prueba (staging) muestra qué paso falló; los demás, solo el mensaje.
      setNote(code === "push_denied" ? t("push.blocked") : PUSH_TEST && code ? `${t("push.failed")} (${code})` : t("push.failed"));
    } finally {
      setState(await pushState());
      setBusy(false);
    }
  };
  const subtitle = note ?? (state.needsInstall ? t("push.install") : state.blocked ? t("push.blocked") : t("push.subtitle"));
  const savePrefs = (next: PushPreferences) => writePushPrefs(getToken, next).then(setPrefs);
  const choose = (next: PushMode) => void run(async () => {
    await savePrefs({ ...(prefs ?? { quiet: null }), mode: next });
    return null;
  });
  const chooseQuiet = (quiet: PushPreferences["quiet"]) => void run(async () => {
    await savePrefs({ mode: prefs?.mode ?? "all", quiet });
    setQuietSheet(false);
    return null;
  });
  const quietLabel = prefs?.quiet ? `${hhmm(prefs.quiet.from)} – ${hhmm(prefs.quiet.to)}` : t("push.quiet_off");
  const modeRow = (value: PushMode, title: string, detail: string) => (
    <ListRow
      testID={`push-mode-${value}`}
      title={title}
      subtitle={detail}
      right={prefs?.mode === value ? <Icon name="check" size={18} color={theme.primary} /> : <View style={{ width: 18 }} />}
      disabled={busy || prefs === null}
      onPress={() => choose(value)}
    />
  );
  return (
    <>
      <Group>
        <ListRow
          testID="push"
          icon={{ name: "bell", color: "#ef4444" }}
          title={t("push.title")}
          subtitle={subtitle}
          value={state.on ? t("push.on") : t("push.off")}
          disabled={busy || state.needsInstall || (state.blocked && !state.on)}
          onPress={() => void run(async () => {
            if (state.on) await disablePush(getToken);
            else await enablePush(getToken);
            return null;
          })}
        />
        {PUSH_TEST && state.on ? (
          <ListRow testID="push-test" title={t("push.test")} disabled={busy} onPress={() => void run(async () => t("push.test_sent", { count: String(await sendTestPush(getToken)) }))} />
        ) : null}
      </Group>
      {state.on ? (
        <>
          <GroupHeader>{t("push.mode_title")}</GroupHeader>
          <Group>
            {modeRow("needs_you", t("push.mode.needs_you"), t("push.mode.needs_you_detail"))}
            {modeRow("all", t("push.mode.all"), t("push.mode.all_detail"))}
            {modeRow("off", t("push.mode.off"), t("push.mode.off_detail"))}
          </Group>
          {PUSH_IOS ? <Text style={{ color: theme.textMuted, fontSize: 12, marginHorizontal: 20, marginTop: 8 }}>{t("push.mode.ios")}</Text> : null}
          <GroupHeader>{t("push.quiet_title")}</GroupHeader>
          <Group>
            <ListRow
              testID="push-quiet"
              title={t("push.quiet_title")}
              subtitle={t("push.quiet_subtitle")}
              value={quietLabel}
              chevron
              disabled={busy || prefs === null}
              onPress={() => setQuietSheet(true)}
            />
          </Group>
        </>
      ) : null}
      <View style={{ height: 20 }} />
      <Sheet visible={quietSheet} title={t("push.quiet_title")} onClose={() => setQuietSheet(false)}>
        <SheetOption label={t("push.quiet_off")} selected={!prefs?.quiet} onPress={() => chooseQuiet(null)} />
        {QUIET_PRESETS.map((preset) => (
          <SheetOption
            key={`${preset.from}-${preset.to}`}
            label={`${hhmm(preset.from)} – ${hhmm(preset.to)}`}
            selected={prefs?.quiet?.from === preset.from && prefs?.quiet?.to === preset.to}
            onPress={() => chooseQuiet({ ...preset, offset: new Date().getTimezoneOffset() })}
          />
        ))}
      </Sheet>
    </>
  );
}
