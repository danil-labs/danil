import { type ComponentProps, lazy, Suspense } from "solid-js";

const Arbol = lazy(() => import("./FileTree"));

/** El árbol de archivos en su propio chunk: no pesa en la carga inicial (`tests/perf/bundle-size.mjs`). */
export default function ArbolDeArchivos(props: ComponentProps<typeof Arbol>) {
  return (
    <Suspense>
      <Arbol {...props} />
    </Suspense>
  );
}
