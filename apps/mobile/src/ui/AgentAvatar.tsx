import { TaskOrbit } from "./TaskOrbit";
import { useTheme } from "./theme";
import { astroBlink, astroMotion, ASTRO_SHAPES, astroBody, astroColors, type AstroNode } from "@terminus/design";
import { Image, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";
import { useActivityTime } from "./activityClock";
import { useState } from "react";
import { useWorkspaces } from "../lib/workspaces";

const SHAPES = { g: G, circle: Circle, ellipse: Ellipse, path: Path };

function Shape({ node, colors, time, eye }: { node: AstroNode; colors: readonly [string, string]; time: number; eye: string }) {
  const Component = SHAPES[node.tag];
  const props = Object.fromEntries(Object.entries(node.attrs).filter(([key]) => key !== "class" && key !== "style").map(([key, value]) => [
    key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
    typeof value === "string" ? value.replace("var(--astro-1)", colors[0]).replace("var(--astro-2)", colors[1]).replace("var(--astro-ojo)", eye) : value,
  ]));
  const motion = astroMotion(String(node.attrs.class ?? ""), time, node.attrs.style as Record<string, string> | undefined);
  return <Component {...props} {...motion}>{node.children?.map((child, index) => <Shape key={index} node={child} colors={colors} time={time} eye={eye} />)}</Component>;
}

/** La misma identidad del escritorio; las imágenes viajan por preview_file, nunca por file://. */
export function AgentAvatar({ name, size = 32, host, folder, working = false }: { name: string; size?: number; host?: string; folder?: string; working?: boolean }) {
  const { snapshot } = useWorkspaces();
  const agent = snapshot?.agents.find((a) => a.name === name && (!host || a.places.some((p) => p.host === host && (folder === undefined || p.folder === folder))));
  const appearance = host ? agent?.places.find((p) => p.host === host && (folder === undefined || p.folder === folder)) : agent;
  const body = astroBody(name, appearance?.body);
  const dark = useTheme().dark;
  const colors = astroColors(body, dark);
  const [failed, setFailed] = useState<string | null>(null);
  const image = appearance?.avatar;
  const time = useActivityTime(working && !(image && failed !== image));
  const eye = body === "hole" ? "#eef1fa" : "#0b1026";
  const asleep = !working && agent?.status === "asleep";
  return <View style={{ width: size, height: size, opacity: asleep ? 0.62 : 1 }}>
    {image && failed !== image ? <><Image source={{ uri: image }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="contain" onError={() => setFailed(image)} />{working ? <View pointerEvents="none" style={{ position: "absolute", inset: -3 }}><TaskOrbit size={size + 6} /></View> : null}</> : (
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Shape node={ASTRO_SHAPES[body]} colors={colors} time={time} eye={eye} />
        {asleep ? <G fill="none" stroke={body === "hole" ? "#eef1fa" : "#0b1026"} strokeWidth={2.7} strokeLinecap="round"><Path d="M21.5 34q4.5 4 9 0M33.5 34q4.5 4 9 0" /></G> : <G fill={eye} transform={astroBlink(time)}><Ellipse cx={26} cy={34} rx={2.7} ry={3.5} /><Ellipse cx={38} cy={34} rx={2.7} ry={3.5} /></G>}
      </Svg>
    )}
  </View>;
}
