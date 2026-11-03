import { type IconShape, LUCIDE, SIGNAL_DOT_SIZE, STATUS_ICONS, STATUS_LABELS, type StatusLabel, type TaskState, topState } from "@terminus/design";
import { Platform, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { AgentAvatar } from "./AgentAvatar";
import { TaskOrbit } from "./TaskOrbit";
import { lang } from "../lib/i18n";
import { type Theme, useTheme } from "./theme";

export { type TaskState, topState };

export function stateColor(state: TaskState, theme: Theme) {
  switch (state) {
    case "failed":
      return theme.failedMark;
    case "approving":
      return theme.approving;
    case "working":
      return theme.primary;
    case "unseen":
      return theme.unseenMark;
    case "interrupted":
      return theme.textMuted;
    default:
      return theme.asked;
  }
}

export function stateText(state: StatusLabel) {
  return STATUS_LABELS[lang][state];
}

function Shape({ shape, color }: { shape: IconShape; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  if (shape.kind === "circle") return <Circle cx={shape.cx} cy={shape.cy} r={shape.r} {...stroke} />;
  if (shape.kind === "line") return <Line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...stroke} />;
  return <Path d={shape.d} {...stroke} />;
}

function Icon({ state, color, size }: { state: Exclude<StatusLabel, "working">; color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {LUCIDE[STATUS_ICONS[state]].map((shape, i) => (
        <Shape key={i} shape={shape as IconShape} color={color} />
      ))}
    </Svg>
  );
}

/** The mark of one task, or of a folded group; nothing when there is nothing to say. */
export function TaskMark({ state, delivered = false, size = 16, identity }: { state: TaskState | null; delivered?: boolean; size?: number; identity?: { agent?: string | null; provider?: string | null; host?: string; folder?: string } }) {
  const theme = useTheme();
  const box = { width: size, height: size, alignItems: "center" as const, justifyContent: "center" as const };
  if (identity) {
    // Lo visto no lleva punto, ni gris (`markedState`).
    const label = [identity.agent, state ? stateText(state) : ""].filter(Boolean).join(" · ");
    const color = state === "asked" || state === "approving" ? theme.warningStrong : state ? stateColor(state, theme) : theme.delivered;
    return <View testID="task-identity" {...(Platform.OS === "web" ? { title: label } : {})} style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }} accessibilityRole={label ? "image" : undefined} accessibilityLabel={label || undefined}>
      {identity.agent ? <AgentAvatar name={identity.agent} host={identity.host} folder={identity.folder} size={18} working={state === "working"} /> : null}
      {state === "working" ? (identity.agent ? null : <TaskOrbit size={16} />) : state ? <View pointerEvents="none" style={{ position: "absolute", top: -2, right: -2, width: 12, height: 12, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface }}>
        <View testID="task-dot" style={{ width: SIGNAL_DOT_SIZE, height: SIGNAL_DOT_SIZE, borderRadius: SIGNAL_DOT_SIZE / 2, backgroundColor: color }} />
      </View> : null}
    </View>;
  }
  if (state === "working") return <View style={box} accessibilityLabel={stateText("working")}><TaskOrbit size={size} /></View>;
  if (state) {
    return (
      <View style={box} accessibilityLabel={stateText(state)}>
        <Icon state={state} color={stateColor(state, theme)} size={size} />
      </View>
    );
  }
  if (delivered) {
    return (
      <View style={box} accessibilityLabel={stateText("delivered")}>
        <Icon state="delivered" color={theme.delivered} size={size} />
      </View>
    );
  }
  return <View style={box} />;
}
