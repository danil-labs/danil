import "../../src/locales/catalogs";
import { render } from "solid-js/web";
import DanilServices from "../../../../packages/features/chat/src/components/DanilServices.tsx";
import SelectorDeModelo from "../../../../packages/features/chat/src/components/model-picker-view.tsx";
import { aplicarLengua } from "../../src/lib/i18n";

export function mountServices(root: HTMLElement, props: Parameters<typeof DanilServices>[0]) {
  aplicarLengua();
  return render(() => <DanilServices {...props} />, root);
}

export function mountPicker(root: HTMLElement, props: Parameters<typeof SelectorDeModelo>[0]) {
  aplicarLengua();
  return render(() => <SelectorDeModelo {...props} />, root);
}
