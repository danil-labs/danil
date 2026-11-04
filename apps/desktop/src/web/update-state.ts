import { createSignal } from "solid-js";

export const [newBuild, setNewBuild] = createSignal<string | null>(null);
/** Whether `UpdateNotice` can show; before that nothing on screen is at stake and a reload is the way out. */
export const [updateNoticeReady, setUpdateNoticeReady] = createSignal(false);

/** A chunk that is gone: the tab is behind even if the check has not said so yet. */
export const announceStaleTab = () => setNewBuild("stale");
