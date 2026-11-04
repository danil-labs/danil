/**
 * El ancla de Safari (`src/lib/scrollAnchor.ts`): devuelve lo que se movió una sola
 * vez, aunque la lista vuelva a medir después.
 *
 *   node --test apps/mobile/scripts/scroll-anchor.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { restoreAnchor, scrollToEnd } from "../src/lib/scrollAnchor.ts";

/** Un hilo invertido: subir `scrollTop` baja lo que se ve. `pushed` es lo que creció por abajo. */
const thread = (scrollTop: number) => {
  const state = { pushed: 0 };
  const scroller = { scrollTop, contains: () => true } as unknown as Element;
  const element = { isConnected: true, getBoundingClientRect: () => ({ top: scroller.scrollTop - state.pushed }) } as unknown as Element;
  return { state, scroller, element };
};

test("lo que subió vuelve a su sitio, y volver a medir no lo mueve otra vez", () => {
  const { state, scroller, element } = thread(500);
  const anchor = { element, top: 500 };
  state.pushed = 300;
  restoreAnchor(scroller, anchor);
  assert.equal(element.getBoundingClientRect().top, 500);
  restoreAnchor(scroller, anchor);
  assert.equal(scroller.scrollTop, 800);
});

test("un ancla que ya no está en el hilo no mueve nada", () => {
  const { scroller, element } = thread(500);
  restoreAnchor(scroller, { element: { ...element, isConnected: false } as Element, top: 900 });
  assert.equal(scroller.scrollTop, 500);
  restoreAnchor(scroller, null);
  assert.equal(scroller.scrollTop, 500);
});


test("chronological content keeps its visual anchor when older rows prepend or shrink", () => {
  const scroller = { scrollTop: 500, contains: () => true } as unknown as Element;
  let added = 0;
  const element = { isConnected: true, getBoundingClientRect: () => ({ top: added - scroller.scrollTop }) } as unknown as Element;
  const anchor = { element, top: -500 };
  added = 300;
  restoreAnchor(scroller, anchor, false);
  assert.equal(scroller.scrollTop, 800);
  assert.equal(element.getBoundingClientRect().top, anchor.top);
  restoreAnchor(scroller, anchor, false);
  assert.equal(scroller.scrollTop, 800);
  added = 100;
  restoreAnchor(scroller, anchor, false);
  assert.equal(scroller.scrollTop, 600);
  assert.equal(element.getBoundingClientRect().top, anchor.top);
});


test("a virtualized row can remount before the anchor is restored", () => {
  let row: Element | null = null;
  const scroller = { scrollTop: 500, contains: (candidate: Element) => candidate === row, querySelectorAll: () => row ? [row] : [] } as unknown as Element;
  const anchor = { element: { isConnected: false } as Element, top: -500, id: "chat-row:qa" };
  assert.equal(restoreAnchor(scroller, anchor, false), false);
  row = { id: "chat-row:qa", isConnected: true, getBoundingClientRect: () => ({ top: 300 - scroller.scrollTop }) } as unknown as Element;
  assert.equal(restoreAnchor(scroller, anchor, false), true);
  assert.equal(scroller.scrollTop, 800);
});

test("an anchor from another scroller never moves this conversation", () => {
  const foreign = { id: "chat-row:qa", isConnected: true, getBoundingClientRect: () => ({ top: 999 }) } as unknown as Element;
  const scroller = { scrollTop: 500, contains: () => false, querySelectorAll: () => [foreign] } as unknown as Element;
  assert.equal(restoreAnchor(scroller, { element: foreign, top: 100, id: foreign.id }, false), false);
  assert.equal(scroller.scrollTop, 500);
});

test("enviar baja al final aunque react-native-web haya cambiado el scrollTo del nodo", () => {
  const node = {
    scrollTop: 885,
    scrollHeight: 1583,
    // Como `ScrollView` de react-native-web: lee `y`, no `top`.
    scrollTo({ y }: { y?: number }) { node.scrollTop = y ?? 0; },
    scroll({ top }: { top: number }) { node.scrollTop = top; },
  };
  scrollToEnd(node as unknown as Element, true);
  assert.equal(node.scrollTop, 1583);
  node.scrollTop = 885;
  scrollToEnd(node as unknown as Element, false);
  assert.equal(node.scrollTop, 1583);
});
