import { STATUS_LABELS, TEXT } from "@terminus/design";
import { stepCounts } from "@terminus/chat/steps";
import { commandSummary } from "@terminus/chat/command";
import { readableToolName, toolSource, type ToolSource } from "@terminus/chat/tools";
import { type ComponentRef, type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { OPENED, type Follow, type Metrics, measuredFollow, shouldStick } from "../../lib/follow";
import { lang, t, w } from "../../lib/i18n";
import { type Line, type Step, type StepRow, type WorkLine, type WorkRun, elapsed, fileName, hitOf, runningStep, workFocus } from "../../lib/steps";
import type { WorkSheetState } from "../../lib/workSheet";
import { ToolBrandMark } from "../BrandMark";
import { Icon, type IconName } from "../Icon";
import { PermissionCard } from "../PermissionCard";
import { type Theme, useTheme } from "../theme";

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

const STEP_ICON: Record<StepRow["kind"], IconName> = { read: "file-text", search: "search", edit: "file-pen-line", run: "square-terminal", web: "globe", plan: "list-checks", other: "wrench", permission: "shield-check" };

/** El servicio del que salió la fila, si la herramienta es de un MCP. */
const toolOrigin = (step: Step | undefined): ToolSource | null => (step ? toolSource(step.name) : null);

/** Lo que lleva o tardó, como en la ventana: el mismo formato en vivo y al cerrar. */
export function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  if (total < 1) return w("common.duration.under_second");
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? w("common.duration.min_sec", { minutes, seconds }) : w("common.duration.sec", { seconds });
}

/** El resumen de un tramo: cuántos actos de cada clase, en prosa. */
export function workSummary(steps: readonly Step[], live: boolean) {
  const parts = stepCounts(steps).map(({ kind, count }) => {
    if (kind === "allowed") return w("common.steps.summary.allowed", { count });
    if (kind === "denied") return w("common.steps.summary.denied", { count });
    return live ? w(`common.steps.summary_live.${kind}`, { count }) : w(`common.steps.summary.${kind}`, { count });
  });
  const text = parts.join(w("common.steps.summary.separator"));
  return text.charAt(0).toLocaleUpperCase(lang) + text.slice(1);
}

function pastEdit(name: string) {
  if (name === "Write") return w("common.steps.write.one");
  return name === "file_change" ? w("common.steps.change.one") : w("common.steps.edit.one");
}

function runningEdit(name: string) {
  if (name === "Write") return w("common.steps.writing");
  return name === "file_change" ? w("common.steps.changing") : w("common.steps.editing");
}

/** En presente lo que sigue corriendo, como `enCurso` del escritorio. */
function runningLabel(step: Step): { verb: string; subject: string | null; origin?: ToolSource } {
  const target = step.target;
  switch (step.kind) {
    case "read":
      return { verb: w("common.steps.reading"), subject: target && fileName(target) };
    case "search":
      return { verb: w("common.steps.searching"), subject: target };
    case "edit":
      return { verb: runningEdit(step.name), subject: target && fileName(target) };
    case "run":
      return { verb: w("common.steps.running"), subject: target && commandSummary(target) };
    case "web":
      return { verb: w("common.steps.web_searching"), subject: target };
    case "plan":
      return { verb: w("common.steps.planning"), subject: null };
    default: {
      const origin = toolOrigin(step);
      return origin
        ? { verb: w("common.steps.using", { tool: readableToolName(origin.tool) }), subject: target, origin }
        : { verb: w("common.steps.using", { tool: step.name }), subject: target };
    }
  }
}

/** La cabecera de una fila, como `resumen` del escritorio: el verbo se lee, el sujeto va en mono y el dueño va antes. */
function rowLabel(row: StepRow): { verb: string; subject: string | null; origin?: ToolSource } {
  const n = row.steps.length;
  const first = row.steps[0];
  const target = first.target;
  if (n === 1 && first.running) return runningLabel(first);
  switch (row.kind) {
    case "permission": {
      const subject = target && commandSummary(target);
      const vars = { tool: first.name, who: first.by ?? "" };
      if (first.by) return { verb: w(first.allowed ? "common.steps.permission.allowed_by" : "common.steps.permission.denied_by", vars), subject };
      return { verb: w(first.allowed ? "common.steps.permission.allowed" : "common.steps.permission.denied", vars), subject };
    }
    case "read":
      return n === 1 ? { verb: w("common.steps.read.one"), subject: target && fileName(target) } : { verb: w("common.steps.read.many", { count: n }), subject: null };
    case "search":
      return n === 1 ? { verb: w("common.steps.search.one"), subject: target } : { verb: w("common.steps.search.many", { count: n }), subject: null };
    case "edit": {
      const files = new Set(row.steps.map((s, i) => s.target ?? `#${i}`)).size;
      return n === 1 ? { verb: pastEdit(first.name), subject: target && fileName(target) } : { verb: w("common.steps.edit.many", { count: files }), subject: null };
    }
    case "run":
      return { verb: w("common.steps.run"), subject: target && commandSummary(target) };
    case "web":
      return n === 1 ? { verb: w("common.steps.web.one"), subject: target } : { verb: w("common.steps.web.many", { count: n }), subject: null };
    case "plan":
      return { verb: n === 1 ? w("common.steps.plan.one") : w("common.steps.plan.many", { count: n }), subject: null };
    default: {
      const origin = n === 1 ? toolOrigin(first) : null;
      if (origin) return { verb: w("common.steps.other.one", { tool: readableToolName(origin.tool) }), subject: target, origin };
      return n === 1 ? { verb: w("common.steps.other.one", { tool: first.name }), subject: target } : { verb: w("common.steps.other.many", { count: n }), subject: null };
    }
  }
}

/** Un texto con lo buscado resaltado: `text` sobre `userBubble` es el par que da contraste en los dos temas. */
function Marked({ text, needle, theme }: { text: string; needle: string; theme: Theme }) {
  if (!needle) return text;
  const lower = text.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
    out.push(text.slice(from, at));
    out.push(<Text key={at} style={{ backgroundColor: theme.userBubble, color: theme.text }}>{text.slice(at, at + needle.length)}</Text>);
    from = at + needle.length;
  }
  out.push(text.slice(from));
  return out;
}

/** El grupo en el chat: un resumen que abre la hoja. Con lo buscado adentro, enseña la coincidencia y lleva a ella. */
export const WorkGroup = memo(function WorkGroup({ line, needle, paused, onOpen }: { line: WorkLine; needle: string; paused: boolean; onOpen: (line: WorkLine, at: number, find: string | null) => void }) {
  const theme = useTheme();
  const spinning = line.live && !paused;
  const summary = workSummary(line.steps, spinning);
  const hit = needle ? hitOf(line, needle) : null;
  const duration = !line.live && line.durationMs !== null ? formatDuration(line.durationMs) : null;
  return (
    <View style={styles.group}>
      <Pressable
        testID="work-group"
        accessibilityRole="button"
        accessibilityLabel={duration ? `${summary}, ${w("chat.work.duration", { duration })}` : summary}
        onPress={() => onOpen(line, line.at, null)}
        style={({ pressed }) => [styles.head, pressed ? { backgroundColor: theme.muted } : null]}
      >
        <Icon name="chevron-right" size={14} color={theme.textMuted} />
        {spinning ? <ActivityIndicator size="small" color={theme.primary} style={styles.spinner} /> : null}
        <Text numberOfLines={2} style={[styles.summary, { color: theme.textMuted }]}>{summary}</Text>
        {duration ? <Text style={[styles.duration, { color: theme.textMuted }]}>{duration}</Text> : null}
      </Pressable>
      {hit ? (
        <Pressable accessibilityRole="button" testID="work-hit" onPress={() => onOpen(line, hit.at, needle)} style={styles.hit}>
          <Text numberOfLines={1} style={[styles.mono, { color: theme.textMuted }]}>
            <Marked text={hit.text.split("\n").find((part) => part.toLowerCase().includes(needle)) ?? hit.text} needle={needle} theme={theme} />
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

/** Lo que el agente pensó en el turno, plegado: el mismo lenguaje que una fila de trabajo. */
export const ReasoningRow = memo(function ReasoningRow({ line, open, onToggle }: { line: Extract<Line, { kind: "reasoning" }>; open: boolean; onToggle: (key: string) => void }) {
  const theme = useTheme();
  const summary = line.live
    ? t("chat.reasoning.thinking")
    : line.durationMs !== null
      ? t("chat.reasoning.summary", { duration: formatDuration(line.durationMs) })
      : t("chat.reasoning.title");
  return (
    <View style={styles.group}>
      <Pressable
        testID="reasoning"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={summary}
        onPress={() => onToggle(line.key)}
        style={({ pressed }) => [styles.head, pressed ? { backgroundColor: theme.muted } : null]}
      >
        <View style={open ? styles.chevronOpen : null}><Icon name="chevron-right" size={12} color={theme.textMuted} /></View>
        <Text numberOfLines={2} style={[styles.summary, { color: theme.textMuted }]}>{summary}</Text>
      </Pressable>
      {open ? (
        <View style={[styles.body, { borderLeftColor: theme.border }]}>
          <Text selectable style={[styles.plain, { color: theme.textMuted }]}>{line.text}</Text>
        </View>
      ) : null}
    </View>
  );
});

/** Qué corre y cuánto lleva. El segundero vive aquí: que avance no repinta la conversación. */
export function TurnStatus({ run, since, waiting }: { run: WorkRun | undefined; since: number | null; waiting: boolean }) {
  const theme = useTheme();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (since === null || waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since, waiting]);
  const step = runningStep(run);
  const label = step ? runningLabel(step) : null;
  if (waiting) {
    return (
      <View style={styles.status} accessibilityRole="text" testID="turn-status">
        <View style={[styles.dot, { backgroundColor: theme.approving }]} />
        <Text numberOfLines={1} style={[styles.statusText, { color: theme.textMuted }]}>{STATUS_LABELS[lang].approving}</Text>
      </View>
    );
  }
  return (
    <View style={styles.status} accessibilityRole="text" testID="turn-status">
      <View style={[styles.dot, { backgroundColor: theme.primary }]} />
      <Text style={[styles.statusText, { color: theme.textMuted, flexShrink: 0 }]}>{label?.origin ? `${label.origin.label} · ` : ""}{label ? label.verb : `${t("state.working")}…`}</Text>
      {label?.subject ? <Text numberOfLines={1} style={[styles.mono, { flexShrink: 1, color: theme.textMuted }]}>{label.subject}</Text> : null}
      {since !== null ? <Text style={[styles.duration, { color: theme.textMuted }]}>{`· ${formatDuration(elapsed(since, Math.max(now, Date.now())))}`}</Text> : null}
    </View>
  );
}

/** Si la fila tiene algo más que enseñar que su renglón. */
const opensBody = (row: StepRow) => row.steps.length > 1 || (row.steps[0].target ?? "").includes("\n") || (row.steps[0].target ?? "").length > 30;
const isLongBody = (text: string) => text.split("\n").length > 6 || text.length > 260;

const WorkRow = memo(function WorkRow({ row, id, open, full, needle, onToggle, onLayout, theme }: { row: StepRow; id: string; open: boolean; full: boolean; needle: string; onToggle: (id: string) => void; onLayout: (id: string, y: number) => void; theme: Theme }) {
  const { verb, subject, origin } = rowLabel(row);
  const failed = row.steps.some((step) => step.ok === false);
  const running = row.steps.some((step) => step.running);
  const canOpen = opensBody(row);
  const target = row.steps[0].target ?? "";
  const long = isLongBody(target);
  const head = (
    <>
      {canOpen ? <View style={open ? styles.chevronOpen : null}><Icon name="chevron-right" size={12} color={theme.textMuted} /></View> : <View style={styles.chevronGap} />}
      {running ? (
        <ActivityIndicator size="small" color={theme.primary} style={styles.spinner} />
      ) : origin ? (
        <View style={styles.icon}><ToolBrandMark server={origin.server} size={14} color={theme.textMuted} /></View>
      ) : (
        <View style={styles.icon}><Icon name={STEP_ICON[row.kind]} size={14} color={theme.textMuted} /></View>
      )}
      {origin ? <Text numberOfLines={1} style={[styles.who, { color: theme.textMuted }]}>{origin.label}</Text> : null}
      {origin ? <Text style={[styles.sep, { color: theme.textMuted }]}>·</Text> : null}
      <Text numberOfLines={1} style={[styles.verb, { color: theme.text, flexShrink: subject ? 0 : 1 }]}>{verb}</Text>
      {subject ? <Text numberOfLines={1} style={[styles.mono, styles.subject, { color: theme.textMuted }]}><Marked text={subject} needle={needle} theme={theme} /></Text> : <View style={{ flex: 1 }} />}
      {failed ? <Text style={[styles.failed, { color: theme.error }]}>{w("chat.timeline.failed")}</Text> : null}
    </>
  );
  return (
    <View onLayout={(e) => onLayout(id, e.nativeEvent.layout.y)}>
      {canOpen ? (
        <Pressable testID="work-row" accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => onToggle(id)} style={({ pressed }) => [styles.row, { borderBottomColor: theme.border }, pressed ? { backgroundColor: theme.muted } : null]}>
          {head}
        </Pressable>
      ) : (
        <View style={[styles.row, { borderBottomColor: theme.border }]}>{head}</View>
      )}
      {open ? (
        <View style={[styles.body, { borderLeftColor: theme.border }]}>
          {row.steps.length > 1 ? (
            row.steps.map((step, i) => (
              <Text key={i} selectable style={[styles.mono, { color: theme.textMuted }]}><Marked text={step.target ?? step.name} needle={needle} theme={theme} /></Text>
            ))
          ) : (
            <>
              <Text selectable numberOfLines={long && !full ? 6 : undefined} style={[styles.mono, { color: theme.textMuted }]}><Marked text={target} needle={needle} theme={theme} /></Text>
              {long ? (
                <Pressable onPress={() => onToggle(`${id}\nfull`)} hitSlop={8} style={styles.more}>
                  <Text style={{ color: theme.text, fontSize: TEXT.label, textDecorationLine: "underline" }}>{w(full ? "chat.timeline.command.show_less" : "chat.timeline.command.show_all")}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}, (a, b) => a.open === b.open && a.full === b.full && a.needle === b.needle && a.theme === b.theme && JSON.stringify(a.row) === JSON.stringify(b.row));

/** Toda la ejecución, en vivo: los pasos y avances en su orden. Sirve igual en la hoja nativa y en la de web. */
export function WorkSheet({ state, run, last, focus, find, onClose }: { state: WorkSheetState; run: WorkRun | null; last: boolean; focus: number; find: string; onClose: () => void }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const item = find && run ? workFocus(run.items, focus, find) : undefined;
    return new Set(item?.kind === "row" ? [item.id, `${item.id}\nfull`] : []);
  });
  const toggle = useCallback((id: string) => setExpanded((now) => {
    const next = new Set(now);
    if (!next.delete(id)) next.add(id);
    return next;
  }), []);

  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const follow = useRef<Follow>({ ...OPENED, following: false, near: false });
  const positions = useRef(new Map<string, number>());
  const target = useMemo(() => (run ? workFocus(run.items, focus, find)?.id ?? null : null), [run === null, focus, find]);
  const placed = useRef(false);
  const onRowLayout = useCallback((id: string, y: number) => {
    positions.current.set(id, y);
    if (id !== target || placed.current) return;
    placed.current = true;
    scroller.current?.scrollTo({ y: Math.max(0, y - 8), animated: false });
  }, [target]);
  // También con lo medido: una ejecución que cabe no da ningún evento de scroll, y aun así está en su final.
  const metrics = useRef({ offset: 0, content: 0, viewport: 0 });
  const measured = useCallback((next: Partial<Metrics>) => {
    metrics.current = { ...metrics.current, ...next };
    follow.current = measuredFollow(follow.current, metrics.current, 0);
    if (!("offset" in next) && shouldStick(follow.current)) scroller.current?.scrollToEnd({ animated: false });
  }, []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    measured({ offset: contentOffset.y, content: contentSize.height, viewport: layoutMeasurement.height });
  }, [measured]);

  const permission = state.permissions[0] ?? null;
  const live = (run?.live ?? false) && !permission;
  const summary = run ? workSummary(run.steps, live) : "";
  const duration = run && !run.live && run.durationMs !== null ? formatDuration(run.durationMs) : null;
  const notice = state.note ?? state.waking ?? state.asleep;
  return (
    <View style={styles.sheet} testID="work-sheet">
      <View style={styles.sheetHead}>
        <Text numberOfLines={2} style={[styles.sheetSummary, { color: theme.textMuted }]}>{duration ? `${summary} · ${duration}` : summary}</Text>
        <Pressable testID="work-close" accessibilityRole="button" accessibilityLabel={t("chat.close")} onPress={onClose} style={styles.close}>
          <Icon name="x" size={18} color={theme.textMuted} />
        </Pressable>
      </View>
      {permission ? (
        <View style={styles.top}>
          <PermissionCard
            key={permission.request_id}
            permission={permission}
            position={state.permissions.length > 1 ? { current: 1, total: state.permissions.length } : null}
            disabled={state.asleep !== null}
            busy={state.deciding.has(permission.request_id)}
            onDecide={(allow) => state.decide(permission, allow)}
          />
        </View>
      ) : run?.live && last ? (
        <View style={styles.top}>
          <TurnStatus run={run} since={state.since} waiting={false} />
        </View>
      ) : null}
      {state.questions ? (
        <Pressable testID="work-question" accessibilityRole="button" onPress={onClose} style={[styles.question, { backgroundColor: theme.muted, borderColor: theme.info }]}>
          <Text style={{ color: theme.text, fontSize: TEXT.ui }}>{t("task.question")}</Text>
        </Pressable>
      ) : null}
      {notice ? <Text testID="work-note" accessibilityRole="alert" style={[styles.notice, { color: theme.textMuted }]}>{notice}</Text> : null}
      <ScrollView
        ref={scroller}
        testID="work-list"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={(_, content) => measured({ content })}
        onLayout={(e) => measured({ viewport: e.nativeEvent.layout.height })}
        contentInsetAdjustmentBehavior="automatic"
      >
        {(run?.items ?? []).map((item) =>
          item.kind === "note" ? (
            <Text key={item.id} onLayout={(e) => onRowLayout(item.id, e.nativeEvent.layout.y)} selectable style={[styles.note, { color: theme.textMuted }]}><Marked text={item.text} needle={find} theme={theme} /></Text>
          ) : (
            <WorkRow key={item.id} id={item.id} row={item.row} open={expanded.has(item.id)} full={expanded.has(`${item.id}\nfull`)} needle={find} onToggle={toggle} onLayout={onRowLayout} theme={theme} />
          ),
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { alignSelf: "stretch" },
  head: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 4, paddingVertical: 4, borderRadius: 8 },
  spinner: { width: 14, height: 14, transform: [{ scale: 0.7 }] },
  summary: { flex: 1, fontSize: TEXT.ui, lineHeight: 18, fontWeight: "500" },
  duration: { flexShrink: 0, fontSize: TEXT.label, fontVariant: ["tabular-nums"] },
  hit: { minHeight: 32, paddingLeft: 24, paddingRight: 4, paddingBottom: 8, paddingTop: 4 },
  mono: { fontFamily: MONO, fontSize: TEXT.label, lineHeight: 17 },
  plain: { fontSize: TEXT.ui, lineHeight: 19 },
  status: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: TEXT.ui, lineHeight: 18 },
  sheet: { flex: 1, minHeight: 0 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 6 },
  sheetSummary: { flex: 1, fontSize: TEXT.label, lineHeight: 16 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  top: { flexShrink: 1, minHeight: 0, paddingHorizontal: 12, paddingBottom: 8 },
  question: { marginHorizontal: 12, marginBottom: 8, padding: 10, minHeight: 44, justifyContent: "center", borderRadius: 10, borderWidth: 1 },
  notice: { paddingHorizontal: 16, paddingBottom: 8, fontSize: TEXT.ui },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingHorizontal: 12, paddingBottom: 16 },
  note: { paddingHorizontal: 4, paddingVertical: 8, fontSize: TEXT.body, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 4, paddingVertical: 2, borderBottomWidth: StyleSheet.hairlineWidth },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
  chevronGap: { width: 12 },
  icon: { width: 14, height: 14 },
  who: { maxWidth: 108, flexShrink: 1, fontSize: TEXT.caption, lineHeight: 16 },
  sep: { flexShrink: 0, fontSize: TEXT.caption, lineHeight: 16, opacity: 0.5 },
  verb: { fontSize: TEXT.ui, lineHeight: 18, fontWeight: "500" },
  subject: { flex: 1, minWidth: 0 },
  failed: { flexShrink: 0, marginLeft: 6, fontSize: TEXT.label },
  body: { marginTop: 6, marginBottom: 8, marginLeft: 18, paddingLeft: 10, borderLeftWidth: StyleSheet.hairlineWidth, gap: 4 },
  more: { alignSelf: "flex-start", paddingVertical: 7 },
});
