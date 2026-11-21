import { type Accessor, createMemo, For, type JSX } from "solid-js";

// Los refrescos cambian los datos; el identificador conserva el DOM y el foco.
export function KeyedList<T>(props: {
  each: readonly T[];
  by: (item: T) => string;
  children: (item: Accessor<T>) => JSX.Element;
}) {
  const items = createMemo(() => new Map(props.each.map(item => [props.by(item), item])));
  const keys = createMemo(() => [...items().keys()]);
  return <For each={keys()}>{key => {
    const initial = items().get(key);
    if (initial === undefined) return null;
    return props.children(() => items().get(key) ?? initial);
  }}</For>;
}
