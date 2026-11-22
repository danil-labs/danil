// Botón sin estilo propio: lleva las clases del original tal cual (un <button> crudo cuyo aspecto no coincide con MenuItem, IconButton ni Button; ui-inventory.md).
import type { JSX } from "solid-js";

/** Un `<button type="button">` que no suma clases: quien lo usa conserva el className exacto del original. Un `type` explícito gana. */
export function Pressable(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} />;
}
