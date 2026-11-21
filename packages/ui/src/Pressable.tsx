// port: nuevo — botón sin estilo propio: lleva las clases del original tal cual (un <button> crudo cuyo aspecto no coincide con MenuItem, IconButton ni Button; ui-inventory.md)
import { type JSX, splitProps } from "solid-js";

/** Un `<button type="button">` que no suma clases: el port conserva el className exacto del original. */
export function Pressable(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [propios, resto] = splitProps(props, ["type"]);
  return <button type={propios.type ?? "button"} {...resto} />;
}
