/**
 * El reloj común de todo lo que se repite: loaders, astros, skeletons. WebKit
 * no lleva al compositor una animación con `steps()`: cada paso es una
 * actualización de la ventana en el hilo principal. Si cada elemento cuenta sus
 * pasos desde que montó, N elementos caen en N momentos distintos y la ventana
 * repinta hasta N veces más. Anclados a `startTime = 0` y con pasos de 1/12 s
 * (`global.css`), todos cambian en el mismo cuadro: 12 repintados por segundo
 * con uno o con cuarenta. Entra sola toda animación de CSS infinita.
 */
import { createSignal, onCleanup } from "solid-js";

function alignToSharedClock(event: AnimationEvent) {
  const target = event.target as Element | null;
  if (!target?.getAnimations) return;
  for (const animation of target.getAnimations({ subtree: !!event.pseudoElement })) {
    if (!("animationName" in animation) || animation.animationName !== event.animationName) continue;
    if (animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY) continue;
    if (animation.startTime !== 0) animation.startTime = 0;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("animationstart", alignToSharedClock, true);
}

/** La hora en una señal, con un tic por segundo: para cuentas atrás y «hace N». */
export function createNow(every = 1000) {
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), every);
  onCleanup(() => clearInterval(timer));
  return now;
}
