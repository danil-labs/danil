import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useActivityTime } from "./activityClock";
import { useTheme } from "./theme";

export function TaskOrbit({ children, size = 24 }: { children?: ReactNode; size?: number }) {
  const theme = useTheme();
  const time = useActivityTime(true);
  return <View style={[styles.box, { width: size, height: size }]}>
    {children}
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${Math.floor(time % 2500 * 30 / 2500) * 12}deg` }] }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={theme.primary} strokeWidth={1.6} strokeLinecap="round">
        <Circle cx={12} cy={12} r={10.5} opacity={0.18} />
        <Path d="M12 1.5a10.5 10.5 0 0 1 10.5 10.5" />
      </Svg>
    </View>
  </View>;
}

const styles = StyleSheet.create({ box: { width: 24, height: 24, alignItems: "center", justifyContent: "center" } });
