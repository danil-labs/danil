import { invoke } from "../../../engine-client/src/client.ts";
import { listen } from "../../../../apps/desktop/src/lib/serviceEvents";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { t } from "../../../../apps/desktop/src/lib/i18n";
import { Button } from "../../../ui/src/Button";
import Sitio from "../../sites/src/screens/Site";
import { prosaDe } from "../../../ui/src/Failure";

type AgentsViewStatus = { installed: boolean; enabled: boolean };

export default function Observability(props: { onManage: () => void }) {
  const [url, setUrl] = createSignal<string | null>(null);
  const [unavailable, setUnavailable] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let request = 0;

  const connect = async () => {
    const current = ++request;
    setUrl(null);
    setUnavailable(false);
    setError(null);
    try {
      const status = await invoke<AgentsViewStatus>("agentsview_status");
      if (current !== request) return;
      if (!status.installed || !status.enabled) {
        setUnavailable(true);
        return;
      }
      const connection = await invoke<{ url: string }>("observability_connect");
      if (current === request) setUrl(connection.url);
    } catch (error) {
      if (current === request) setError(prosaDe(error));
    }
  };
  const refresh = () => void connect();
  onMount(refresh);
  window.addEventListener("harness:workspace", refresh);
  const events = listen("agentsview-changed", refresh);
  onCleanup(() => {
    request++;
    window.removeEventListener("harness:workspace", refresh);
    void events.then((unlisten) => unlisten());
    // Sin este aviso el servidor sigue indexando con la pestaña cerrada.
    void invoke("observability_disconnect").catch(() => {});
  });

  return (
    <Show when={url()} fallback={
      <main class="flex h-full flex-col items-center justify-center gap-3 bg-surface px-8 text-center">
        <Show when={unavailable()} fallback={
          <Show when={error()} fallback={
            <p role="status" class="text-sm text-neutral-500">{t("observability.loading")}</p>
          }>
            <p role="alert" class="text-sm text-neutral-700">{t("observability.error")}</p>
            <pre class="max-w-full whitespace-pre-wrap break-all text-xs text-neutral-500">{error()}</pre>
            <Button size="sm" variant="outline" onClick={refresh}>{t("observability.retry")}</Button>
          </Show>
        }>
          <p class="text-sm text-neutral-700">{t("observability.unavailable")}</p>
          <Button size="sm" variant="outline" onClick={props.onManage}>{t("observability.manage")}</Button>
        </Show>
      </main>
    }>
      {(connected) => <Sitio url={connected()} visible />}
    </Show>
  );
}
