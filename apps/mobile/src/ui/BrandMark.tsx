import { useTheme } from "./theme";
import { AGENT_MARKS, agentMarkId, toolMarkId, toolMonogram } from "@terminus/design";
import { TOOL_MARKS } from "@terminus/design/toolMarksData";
import { useId } from "react";
import Svg, { Defs, FeGaussianBlur, Filter, G, Mask, Path, Rect, Text as SvgText } from "react-native-svg";

/**
 * La marca de un proveedor por su id, como `MarcaAgente` del escritorio: los
 * trazos, los colores y qué marca le toca a cada uno salen de `@terminus/design`
 * (`AGENT_MARKS`, `agentMarkId`). Un relleno sin color de marca lleva `color`
 * (el del texto). Un proveedor desconocido no pinta nada.
 */
export function BrandMark({ id, size = 14, color }: { id: string | null | undefined; size?: number; color: string }) {
  const dark = useTheme().dark;
  // Ids por instancia: la marca se pinta varias veces por pantalla, y dos ids iguales se pisan.
  const uid = useId().replace(/[^\w-]/g, "");
  const which = agentMarkId(id);
  if (!which) return null;
  const mark = AGENT_MARKS[which];
  if (mark.spots)
    return (
      <Svg width={size} height={size} viewBox={mark.viewBox}>
        <Defs>
          <Mask id={`${uid}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width="65" height="65">
            <Path d={mark.paths[0].d} fill="#fff" />
          </Mask>
          {mark.spots.map(([, , blur], i) => (
            <Filter key={i} id={`${uid}-f${i}`} x="-50" y="-50" width="170" height="170" filterUnits="userSpaceOnUse">
              <FeGaussianBlur stdDeviation={blur} />
            </Filter>
          ))}
        </Defs>
        <G mask={`url(#${uid}-m)`}>
          {mark.spots.map(([d, fill], i) => (
            <Path key={i} d={d} fill={fill} filter={`url(#${uid}-f${i})`} />
          ))}
        </G>
      </Svg>
    );
  const paths = dark && mark.dark ? mark.dark : mark.paths;
  return (
    <Svg width={size} height={size} viewBox={mark.viewBox}>
      <G transform={mark.transform}>
        {paths.map((p, i) => (
          <Path key={i} d={p.d} fill={p.fill ?? color} />
        ))}
      </G>
    </Svg>
  );
}

/**
 * La marca del servicio que prestó una herramienta, como `MarcaHerramienta`
 * del escritorio. Sin marca conocida pinta una baldosa con la inicial: no
 * afirma un dueño que no sabemos, y el renglón escribe el nombre igual.
 */
export function ToolBrandMark({ server, size = 14, color }: { server: string; size?: number; color: string }) {
  const dark = useTheme().dark;
  const which = toolMarkId(server);
  if (!which) {
    return (
      <Svg width={size} height={size} viewBox="0 0 14 14">
        <Rect width="14" height="14" rx="3.5" fill={color} fillOpacity={0.14} />
        <SvgText x="7" y="10.4" textAnchor="middle" fontSize="8.5" fontWeight="600" fill={color} fillOpacity={0.85}>
          {toolMonogram(server)}
        </SvgText>
      </Svg>
    );
  }
  const mark = TOOL_MARKS[which];
  const paths = dark && mark.dark ? mark.dark : mark.paths;
  return (
    <Svg width={size} height={size} viewBox={mark.viewBox}>
      {paths.map((p, i) => (
        <Path key={i} d={p.d} fill={p.fill ?? color} />
      ))}
    </Svg>
  );
}
