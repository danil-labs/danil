import { render } from 'solid-js/web';
import DanilCredits from '../../src/features/chat/DanilCredits';
import { aplicarLengua } from '../../src/lib/i18n';
export function mount(root: HTMLElement, prepare: () => Promise<void>) {
  aplicarLengua();
  return render(() => <DanilCredits onPrepare={prepare} />, root);
}
