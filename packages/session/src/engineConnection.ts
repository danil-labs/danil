import { createSignal } from "solid-js";

/**
 * Si la ventana ya tiene motor. La ventana abre antes de que `seldon-runtime`
 * conteste (`launcher.rs`, fase `connecting`); lo marca el lanzador al ver `ready`.
 */
const [connected, setConnected] = createSignal(false);
let release: () => void = () => {};
const ready = new Promise<void>((done) => {
  release = done;
});

export { connected };

export function whenConnected(): Promise<void> {
  return ready;
}

export function markConnected() {
  if (connected()) return;
  setConnected(true);
  release();
}
