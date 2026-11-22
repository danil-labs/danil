type BrowserCacheStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

/** A revoked browser session cannot repopulate its cache from a late callback. */
function clearPrefix(store: BrowserCacheStorage, prefix: string) {
  try {
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter((key): key is string => key !== null && key.startsWith(prefix));
    for (const key of keys) store.removeItem(key);
  } catch { /* Storage may be disabled by the browser. */ }
}

export const clearWebCaches = (store: BrowserCacheStorage) => clearPrefix(store, 'danil.web.');

export function sessionStorageScope(store: BrowserCacheStorage, person: string, workspace: string) {
  const personPrefix = `danil.web.${person}.`;
  const prefix = `${personPrefix}${workspace}.`;
  let revoked = false;
  return {
    storage: {
      getItem: (key: string) => revoked ? null : store.getItem(prefix + key),
      setItem: (key: string, value: string) => { if (!revoked) store.setItem(prefix + key, value); },
      removeItem: (key: string) => store.removeItem(prefix + key),
    },
    clear() { revoked = true; clearPrefix(store, personPrefix); },
  };
}
