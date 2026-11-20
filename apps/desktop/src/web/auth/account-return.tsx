import { render } from "solid-js/web";
import { t } from "../../lib/i18n";
import { Button } from "../../ui/Button";

const previousAccount = "danil.web.switch-from";

export function markAccountChoice(store: Storage, sub: string) {
  store.setItem(previousAccount, sub);
}

/** Un retorno con la misma identidad necesita una decisión antes de volver al workspace. */
export function sameAccountReturned(store: Storage, sub: string) {
  const previous = store.getItem(previousAccount);
  if (previous !== sub) {
    if (previous) store.removeItem(previousAccount);
    return false;
  }
  return true;
}

export function confirmAccountReturn(root: HTMLElement, store: Storage, label: string, login: string, resume: () => void) {
  return render(() => <main data-account-return="" class="flex h-full flex-col items-center justify-center gap-4 bg-bg p-6">
    <p role="status">{t("shell.workspaces.same_account", { account: label })}</p>
    <Button as="a" href={login}>{t("shell.workspaces.other_login")}</Button>
    <Button variant="secondary" onClick={() => { store.removeItem(previousAccount); resume(); }}>{t("shell.workspaces.keep_account")}</Button>
  </main>, root);
}
