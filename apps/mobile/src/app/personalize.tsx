import { DEFAULT_SIDEBAR_VIEW, GROUPINGS, SORTS, groupingLabel, sortLabel } from "@terminus/tasks";
import { router } from "expo-router";
import { Linking, ScrollView, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MOBILE_WEB_DIR } from "@terminus/design";
import { ALPHA_DEMO, ALPHA_ORDINARY, WEB_BASE } from "../lib/alpha-mode";
import { useCustomization } from "../lib/customization";
import { useHomeLabel } from "../lib/homeLabel";
import { lang, t, w } from "../lib/i18n";
import { useWorkspaces } from "../lib/workspaces";
import { Icon, type IconName } from "../ui/Icon";
import { Group, GroupFooter, GroupHeader, LargeTitle, ListRow, NavBar, pageColor, SoonTag } from "../ui/list";
import { useTheme } from "../ui/theme";

const ICONS: Record<string, { icon: IconName; color: string }> = {
  inbox: { icon: "inbox", color: "#6539f5" },
  broadcasts: { icon: "megaphone", color: "#ec4899" },
  agents: { icon: "bot", color: "#10b981" },
  channels: { icon: "radio", color: "#0ea5e9" },
  contacts: { icon: "contact", color: "#94a3b8" },
  funnels: { icon: "funnel", color: "#94a3b8" },
  calendar: { icon: "calendar", color: "#94a3b8" },
  inventory: { icon: "package", color: "#94a3b8" },
};

/**
 * Personalizar, desde los deslizadores de Inicio: un solo panel. Arriba, qué
 * secciones enseña Inicio (las que aún no existen, apagadas con «pronto»);
 * debajo, Filtrar (carpetas y agente, en la hoja «Filtrar y agrupar») y
 * Agrupar. Al volver, Inicio ya enseña el cambio.
 */
export default function Personalize() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const back = useHomeLabel();
  const model = useCustomization();
  const { snapshot, view, setView } = useWorkspaces();
  const sections = process.env.EXPO_PUBLIC_TERMINUS_ALPHA === "1" && !ALPHA_ORDINARY && model.ready;
  const folderName = (key: string) => snapshot?.folders.find((f) => f.key === key)?.name ?? key;
  const folders = view.folders.length ? view.folders.map(folderName).join(", ") : w("shell.sidebar.view.all_folders");
  const machines = new Set((snapshot?.tasks ?? []).map((task) => task.host)).size > 1;

  return (
    <View style={{ flex: 1, backgroundColor: pageColor(theme) }}>
      <NavBar back={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <LargeTitle>{t("attention.personalize")}</LargeTitle>
        {sections ? (
          <>
            <GroupHeader>{t("customize.home_sections")}</GroupHeader>
            <Group inset={56}>
              {model.entries.map((entry) => {
                const look = ICONS[entry.id] ?? { icon: "square" as const, color: theme.textMuted };
                return (
                  <ListRow
                    key={entry.id}
                    testID={`personalize-${entry.id}`}
                    icon={{ name: look.icon, color: look.color }}
                    muted={!entry.available}
                    title={entry.title}
                    right={entry.available ? (
                      <Switch
                        value={entry.selected}
                        onValueChange={() => void model.toggle(entry.id)}
                        trackColor={{ true: theme.merged, false: theme.border }}
                        thumbColor="#ffffff"
                        {...({ activeThumbColor: "#ffffff" } as object)}
                        accessibilityLabel={entry.title}
                      />
                    ) : <SoonTag />}
                  />
                );
              })}
            </Group>
            {model.temporary ? <GroupFooter>{t("attention.memory")}</GroupFooter> : null}
            {ALPHA_DEMO ? (
              <>
                <View style={{ height: 12 }} />
                <Group>
                  <ListRow testID="leave-demo" title={t("attention.leave_demo")} chevron onPress={() => void Linking.openURL(`${WEB_BASE}${MOBILE_WEB_DIR}/`)} />
                </Group>
              </>
            ) : null}
          </>
        ) : null}

        <GroupHeader>{t("customize.filter")}</GroupHeader>
        <Group>
          <ListRow testID="personalize-folders" title={w("shell.sidebar.view.folders")} value={folders} chevron onPress={() => router.push("/filter")} />
          <ListRow testID="personalize-agent" title={w("shell.sidebar.view.agent")} value={view.agent ?? w("shell.sidebar.view.all_agents")} chevron onPress={() => router.push("/filter")} />
        </Group>

        <GroupHeader>{w("shell.sidebar.view.group")}</GroupHeader>
        <Group>
          {GROUPINGS.filter((g) => g !== "machine" || view.group === g || machines).map((g) => (
            <ListRow
              key={g}
              testID={`personalize-group-${g}`}
              title={groupingLabel(lang, g)}
              value={g === DEFAULT_SIDEBAR_VIEW.group ? w("shell.sidebar.view.default") : undefined}
              right={view.group === g ? <Icon name="check" size={18} color={theme.merged} /> : <View style={{ width: 18 }} />}
              accessibilityLabel={groupingLabel(lang, g)}
              onPress={() => setView({ ...view, group: g })}
            />
          ))}
        </Group>

        <GroupHeader>{w("shell.sidebar.view.sort")}</GroupHeader>
        <Group>
          {SORTS.map((s) => (
            <ListRow
              key={s}
              testID={`personalize-sort-${s}`}
              title={sortLabel(lang, s)}
              value={s === DEFAULT_SIDEBAR_VIEW.sort ? w("shell.sidebar.view.default") : undefined}
              right={view.sort === s ? <Icon name="check" size={18} color={theme.merged} /> : <View style={{ width: 18 }} />}
              accessibilityLabel={sortLabel(lang, s)}
              onPress={() => setView({ ...view, sort: s })}
            />
          ))}
        </Group>
      </ScrollView>
    </View>
  );
}
