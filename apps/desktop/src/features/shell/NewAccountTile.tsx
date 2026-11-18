import { createEffect, createSignal, type JSX, onCleanup } from "solid-js";
import { newAccountTiles } from "./account-return-state";
import "./account-return.css";

export function NewAccountTile(props: { id: string; children: JSX.Element }) {
  const [fresh, setFresh] = createSignal(false);
  const [reduced, setReduced] = createSignal(false);
  createEffect(() => {
    const index = newAccountTiles().indexOf(props.id);
    if (index < 0) { setFresh(false); return; }
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(motion.matches); setFresh(true);
    const finish = () => setFresh(false);
    const changed = () => { setReduced(motion.matches); if (motion.matches) clearTimeout(timer); };
    const timer = motion.matches ? undefined : setTimeout(finish, 2180 + index * 30);
    motion.addEventListener("change", changed);
    onCleanup(() => { clearTimeout(timer); motion.removeEventListener("change", changed); });
  });
  return <div class="contents" data-account-new={fresh() ? "" : undefined} data-reduced-motion={reduced() ? "" : undefined} style={{ "--account-stagger": `${Math.max(0, newAccountTiles().indexOf(props.id)) * 30}ms` }} onClick={() => setFresh(false)}>{props.children}</div>;
}
