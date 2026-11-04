import { useNavigation } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/**
 * En el navegador la pila no anima: la pantalla que se abre encima (Archivos,
 * una carpeta, el visor) entra desde la derecha, y la pantalla a la que se
 * vuelve entra desde la izquierda. La de arriba no se puede ver salir: la pila
 * esconde las de abajo (`display: none`), así que el movimiento lo hace la que
 * reaparece. `enter={false}`: solo anima al volver (el chat).
 */
export function SlideIn({ children, enter = true }: { children: ReactNode; enter?: boolean }) {
  const navigation = useNavigation();
  const [motion, setMotion] = useState<"in" | "back" | null>(enter ? "in" : null);
  const shown = useRef(false);
  useEffect(
    () =>
      navigation.addListener("focus", () => {
        if (!shown.current) {
          shown.current = true;
          return;
        }
        // Quitar la animación un cuadro y volver a ponerla la reinicia.
        setMotion(null);
        requestAnimationFrame(() => setMotion("back"));
      }),
    [navigation],
  );
  return <View style={[styles.slide, motion === "in" ? styles.in : motion === "back" ? styles.back : null]}>{children}</View>;
}

const styles = StyleSheet.create({
  slide: { flex: 1, animationDuration: "240ms", animationTimingFunction: "cubic-bezier(.2,.8,.2,1)" } as object,
  in: { animationKeyframes: { "0%": { transform: "translateX(100%)" }, "100%": { transform: "translateX(0)" } } } as object,
  back: { animationKeyframes: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(0)" } } } as object,
});
