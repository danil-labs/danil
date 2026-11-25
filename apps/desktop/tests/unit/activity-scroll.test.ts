import assert from "node:assert/strict";
import test from "node:test";

let triggerResize: (() => void) | undefined;
const g = globalThis as Record<string, unknown>;
g.requestAnimationFrame = (cb: () => void) => {
  queueMicrotask(cb);
  return 1;
};
g.cancelAnimationFrame = () => {};
g.ResizeObserver = class {
  cb: () => void;
  constructor(cb: () => void) {
    this.cb = cb;
  }
  observe() {
    triggerResize = () => this.cb();
  }
  disconnect() {
    triggerResize = undefined;
  }
};

const { attachActivityBottomFollow } = await import("../../../../packages/features/chat/src/model/activityScroll.ts");

function fakeScroller(clientHeight: number, scrollHeight: number) {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  let top = 0;
  const el = {
    clientHeight,
    scrollHeight,
    get scrollTop() {
      return top;
    },
    set scrollTop(v: number) {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const next = Math.max(0, Math.min(v, max));
      const changed = next !== top;
      top = next;
      if (changed) queueMicrotask(() => emit("scroll", {}));
    },
    addEventListener(name: string, fn: (e: unknown) => void) {
      listeners.set(name, [...(listeners.get(name) ?? []), fn]);
    },
    removeEventListener(name: string, fn: (e: unknown) => void) {
      listeners.set(name, (listeners.get(name) ?? []).filter((f) => f !== fn));
    },
  };
  const emit = (name: string, event: unknown) => listeners.get(name)?.forEach((fn) => fn(event));
  return { el, emit };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

test("activity dropdown starts at bottom, follows live growth, pauses on user scroll up, and resumes at bottom", async () => {
  const { el, emit } = fakeScroller(360, 900);
  const content = {} as HTMLElement;
  const dispose = attachActivityBottomFollow(el as unknown as HTMLElement, content);
  await tick();

  // 1. Opens pinned to the latest output at the bottom.
  assert.equal(el.scrollTop, 540, "al abrir debe mostrar el final del dropdown");

  // 2. While left at the bottom, new streamed steps/reasoning keep it pinned to the end.
  el.scrollHeight = 1200;
  triggerResize?.();
  await tick();
  assert.equal(el.scrollTop, 840, "sigue automáticamente lo nuevo que saca el modelo");

  // 3. User scrolls up with mouse wheel -> stops auto-following.
  emit("wheel", { deltaY: -120 });
  el.scrollTop = 400;
  await tick();
  el.scrollHeight = 1600;
  triggerResize?.();
  await tick();
  assert.equal(el.scrollTop, 400, "al subir a leer se detiene el auto-scroll");

  // 4. User scrolls back to the bottom -> seamlessly resumes following live output.
  el.scrollTop = 1235; // within 16px threshold of max (1240)
  await tick();
  el.scrollHeight = 1900;
  triggerResize?.();
  await tick();
  assert.equal(el.scrollTop, 1540, "al volver al final retoma el seguimiento automático");

  dispose();
});
