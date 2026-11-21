import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";

export const ACTIVITY_MOTIONS = ["quantum", "trio", "leapfrog", "jellyTriangle"] as const;
export type ActivityMotion = typeof ACTIVITY_MOTIONS[number];

/** Consume all four before refilling; the displayed initial figure belongs to the first round. */
export function createActivityMotionCycle(random = Math.random, initial: ActivityMotion = "trio") {
  const shuffle = (): ActivityMotion[] => {
    const values: ActivityMotion[] = [...ACTIVITY_MOTIONS];
    for (let index = values.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [values[index], values[other]] = [values[other], values[index]];
    }
    return values;
  };
  let previous = initial;
  let remaining = shuffle().filter(value => value !== initial);
  return { initial, next(): ActivityMotion {
    if (!remaining.length) {
      remaining = shuffle();
      if (remaining[0] === previous) {
        const other = 1 + Math.floor(random() * (remaining.length - 1));
        [remaining[0], remaining[other]] = [remaining[other], remaining[0]];
      }
    }
    previous = remaining.shift()!;
    return previous;
  } };
}

/** Only mounted, active presentation subscribes; completed history has no listeners or timers. */
export function createActivityMotionPreference(enabled: Accessor<boolean>): Accessor<boolean> {
  const [allowed, setAllowed] = createSignal(false);
  createEffect(() => {
    if (!enabled() || typeof document === "undefined") { setAllowed(false); return; }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const refresh = () => setAllowed(!document.hidden && !media.matches);
    document.addEventListener("visibilitychange", refresh);
    media.addEventListener("change", refresh);
    refresh();
    onCleanup(() => {
      document.removeEventListener("visibilitychange", refresh);
      media.removeEventListener("change", refresh);
    });
  });
  return allowed;
}
