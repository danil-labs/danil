import { createRoot, createSignal } from "solid-js";
import { createAccountReturn } from "../../lib/account-add-return.ts";

export const [accountReturnRevision, setAccountReturnRevision] = createRoot(() => createSignal(0));
const changed = () => setAccountReturnRevision((n) => n + 1);
const storage = (() => { try { return sessionStorage; } catch { return undefined; } })();
export const accountReturn = createAccountReturn(changed, storage);
export const [newAccountTiles, setNewAccountTiles] = createRoot(() => createSignal<readonly string[]>([]));
