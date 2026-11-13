import { type Component, createResource, ErrorBoundary, type JSX, Suspense } from "solid-js";
import { Dynamic } from "solid-js/web";
import { t } from "../lib/i18n";
import { Button } from "./Button";

/**
 * Como `lazy`, pero un fallo de carga no queda guardado: al remontarse vuelve a importar.
 * `lazy` de Solid conserva la promesa rechazada y su reintento fallaría siempre.
 */
export function retryableLazy<P extends object>(load: () => Promise<{ default: Component<P> }>): Component<P> {
  let loaded: Component<P> | undefined;
  return (props: P) => {
    const [part] = createResource(() => loaded ?? load().then((m) => (loaded = m.default)));
    return <Dynamic component={part() as Component<P> | undefined} {...props} />;
  };
}

/** Un trozo perezoso con su propia espera y, si no carga, un aviso con reintento en su sitio. */
export function LazyPart(props: { children: JSX.Element; fallback?: JSX.Element }) {
  return (
    <ErrorBoundary
      fallback={(_, reset) => (
        <div role="alert" class="grid justify-items-start gap-2 p-4 text-sm text-error-strong">
          <p class="m-0">{t("common.part.failed")}</p>
          <Button size="sm" variant="secondary" onClick={reset}>{t("common.part.retry")}</Button>
        </div>
      )}
    >
      <Suspense fallback={props.fallback}>{props.children}</Suspense>
    </ErrorBoundary>
  );
}
