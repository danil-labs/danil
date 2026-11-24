import "../../src/locales/catalogs";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { aplicarLengua } from "../../src/lib/i18n";
import { setCapabilities } from "../../../../packages/host/src/platform";
import UsageTool from "../../../../packages/shell/src/shell/UsageTool";
import DanilCredits from "../../../../packages/features/chat/src/screens/DanilCredits";
import { refreshDanilCreditsBalance } from "../../../../packages/features/chat/src/queries/danil-credits-balance";

export function mountUsageTool(root: HTMLElement, props: Parameters<typeof UsageTool>[0]) {
  aplicarLengua();
  return render(() => <UsageTool {...props} />, root);
}

export function mountCredits(root: HTMLElement) {
  aplicarLengua();
  return render(() => <DanilCredits />, root);
}

export { createSignal, setCapabilities, refreshDanilCreditsBalance };
