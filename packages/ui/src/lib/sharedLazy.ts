import { type Component, createMemo, createRoot, createSignal, type JSX, untrack } from "solid-js";

/**
 * `lazy` para un componente con muchas instancias a la vez, como la cabecera de
 * cada carpeta del riel. El de Solid 1.9 olvida el módulo al desmontarse la
 * instancia que lo pidió, y las demás se repintan vacías.
 */
export function sharedLazy<P extends object>(load: () => Promise<{ default: Component<P> }>): Component<P> {
  const [loaded, setLoaded] = createRoot(() => createSignal<Component<P>>());
  let pending: Promise<void> | undefined;
  return (props: P) => {
    // Si falla la carga, la siguiente instancia la vuelve a pedir.
    if (!pending) pending = load().then((mod) => { setLoaded(() => mod.default); }, () => { pending = undefined; });
    return createMemo(() => {
      const Comp = loaded();
      return Comp ? untrack(() => Comp(props)) : null;
    }) as unknown as JSX.Element;
  };
}
