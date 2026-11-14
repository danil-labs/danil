import { render } from 'solid-js/web';
import DanilServices from '../../src/features/chat/DanilServices';
import { aplicarLengua } from '../../src/lib/i18n';
export function mount(root: HTMLElement, prepare: () => Promise<void>) {
  aplicarLengua();
  const idle = { ready: true, selected: false, onUse: () => {} };
  return render(() => <DanilServices onPrepare={prepare} credits={idle} router={{ ...idle, state: 'loading', activating: false, onActivate: () => {} }} />, root);
}
