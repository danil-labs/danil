import { onCleanup, onMount, Show } from "solid-js";
import { t } from "../lib/i18n";
import { Button } from "../ui/Button";
import { Toast, ToastPortal } from "../ui/Toast";
import { newBuild, setNewBuild, setUpdateNoticeReady } from "./update-state";

/** How often an open tab asks whether a deploy changed the page. */
const CHECK_EVERY = 10 * 60_000;

/** The build a page belongs to: its entry and stylesheet, named by content hash. Later tags are chunks loaded on demand. */
function buildOf(page: Document) {
  const entry = page.querySelector('script[type="module"][src]')?.getAttribute("src");
  const styles = page.querySelector('link[rel="stylesheet"]')?.getAttribute("href");
  return entry ? `${entry} ${styles ?? ""}` : null;
}

/** The deployed build, or null when the answer is not this page: a redirect to sign in serves another app's HTML. */
async function deployedBuild(base: string) {
  const response = await fetch(base, { cache: "no-store" });
  if (!response.ok || response.redirected) return null;
  const page = new DOMParser().parseFromString(await response.text(), "text/html");
  const build = buildOf(page);
  return build?.startsWith(`${base}assets/`) ? build : null;
}

/**
 * Offers the build deployed after this tab loaded, without taking the tab away:
 * «Para después» only closes the notice, the next load already brings the new
 * build, and it returns for a newer deploy or a chunk that is gone.
 */
export function UpdateNotice() {
  const own = buildOf(document);
  let dismissed: string | null = null;
  const check = async () => {
    const build = await deployedBuild(import.meta.env.BASE_URL).catch(() => null);
    if (build && build !== own && build !== dismissed) setNewBuild(build);
  };
  const later = () => {
    dismissed = newBuild();
    setNewBuild(null);
  };
  const visible = () => {
    if (document.visibilityState === "visible") void check();
  };
  onMount(() => {
    setUpdateNoticeReady(true);
    const timer = setInterval(() => void check(), CHECK_EVERY);
    document.addEventListener("visibilitychange", visible);
    onCleanup(() => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      setUpdateNoticeReady(false);
    });
  });

  return (
    <Show when={newBuild()}>
      <ToastPortal>
        <Toast data-web-update="">
          <p class="m-0 text-xs text-neutral-950">{t("web.update.title")}</p>
          <div class="flex gap-2">
            <Button size="compact" data-web-update-reload="" onClick={() => window.location.reload()}>
              {t("web.update.reload")}
            </Button>
            <Button variant="ghost" size="compact" data-web-update-later="" onClick={later}>
              {t("web.update.later")}
            </Button>
          </div>
        </Toast>
      </ToastPortal>
    </Show>
  );
}
