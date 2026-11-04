import { useCallback, useSyncExternalStore } from "react";
import { AccessibilityInfo, AppState, Platform } from "react-native";

let time = 0;
const listeners = new Set<() => void>();
let release: (() => void) | undefined;
const snapshot = () => time;
const serverSnapshot = () => 0;

/** Un solo tic de 1/12 s para órbitas y trazos Astro, como el reloj del escritorio. */
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    let reduced = true;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const publish = (value: number) => { time = value; for (const notify of listeners) notify(); };
    const update = () => {
      clearInterval(timer);
      timer = undefined;
      if (reduced || AppState.currentState === "background" || AppState.currentState === "inactive") { publish(0); return; }
      const tick = () => publish(Math.floor(Date.now() * 12 / 1000) * 1000 / 12);
      tick();
      timer = setInterval(tick, 1000 / 12);
    };
    const setReduced = (value: boolean) => { reduced = value; update(); };
    const app = AppState.addEventListener("change", update);
    const media = Platform.OS === "web" ? window.matchMedia("(prefers-reduced-motion: reduce)") : undefined;
    const changed = () => setReduced(!!media?.matches);
    const accessibility = !media ? AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced) : undefined;
    if (media) {
      media.addEventListener("change", changed);
      changed();
    } else {
      void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduced(value); });
    }
    release = () => {
      alive = false;
      clearInterval(timer);
      time = 0;
      app.remove();
      media?.removeEventListener("change", changed);
      accessibility?.remove();
    };
  }
  return () => { listeners.delete(listener); if (!listeners.size) { release?.(); release = undefined; } };
}

export function useActivityTime(active: boolean) {
  const watch = useCallback((listener: () => void) => active ? subscribe(listener) : () => {}, [active]);
  return useSyncExternalStore(watch, active ? snapshot : serverSnapshot, serverSnapshot);
}
