import type { ReactNode } from "react";

/** En iOS y Android la pila ya anima la pantalla que entra y la que sale. */
export function SlideIn({ children }: { children: ReactNode; enter?: boolean }) {
  return <>{children}</>;
}
