import { createSignal, onCleanup } from "solid-js";
import { listen } from "../../../../apps/desktop/src/lib/serviceEvents";
import { organizationCredits } from "./organization-credits";

export function watchOrganizationCredits() {
  const cache = organizationCredits();
  const [revision, setRevision] = createSignal(0);
  const clear = () => { cache.clear(); setRevision((n) => n + 1); };
  const connected = listen("danil-connect", clear).catch(() => () => {});
  window.addEventListener("harness:workspace", clear);
  window.addEventListener("danil:organization-changed", clear);
  onCleanup(() => {
    void connected.then((stop) => stop()).catch(() => {});
    window.removeEventListener("harness:workspace", clear);
    window.removeEventListener("danil:organization-changed", clear);
  });
  return { read: cache.read, revision };
}
