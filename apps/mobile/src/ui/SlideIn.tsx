import type { ReactNode } from "react";

/** En iOS y Android la pila ya anima la pantalla que entra. */
export function SlideIn({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
