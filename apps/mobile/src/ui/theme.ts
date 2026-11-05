import { THEMES, type ThemeTokens } from "@terminus/design";
import { useColorScheme } from "react-native";
import { useThemeChoice } from "../lib/appearance";

export type Theme = ThemeTokens & { dark: boolean };

const LIGHT: Theme = { ...THEMES.light, dark: false };
const DARK: Theme = { ...THEMES.dark, dark: true };

/** El velo bajo todo lo que se pone delante de la pantalla (hojas, menús, avisos): uno solo para que se vean igual. */
export const SCRIM = "rgba(0,0,0,0.35)";

/** The desktop's default themes, Violeta and Grafito: the one chosen in the profile, or the system's. */
export function useTheme(): Theme {
  const system = useColorScheme();
  const choice = useThemeChoice();
  return (choice === "system" ? system === "dark" : choice === "dark") ? DARK : LIGHT;
}
