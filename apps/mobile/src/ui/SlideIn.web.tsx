import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * En el navegador la pila no anima: la pantalla que se abre encima (Archivos,
 * una carpeta, el visor) entra desde la derecha, como en iOS y Android.
 */
export function SlideIn({ children }: { children: ReactNode }) {
  return <View style={styles.in}>{children}</View>;
}

const styles = StyleSheet.create({
  in: {
    flex: 1,
    animationDuration: "260ms",
    animationTimingFunction: "cubic-bezier(.2,.8,.2,1)",
    animationKeyframes: { "0%": { transform: "translateX(100%)" }, "100%": { transform: "translateX(0)" } },
  } as object,
});
