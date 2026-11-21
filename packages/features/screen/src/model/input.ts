/** Suelta la entrada antes de que noVNC desactive su teclado o el visor pierda el foco. */
export function screenInput(target: HTMLElement) {
  const keys = new Map<string, string>();
  let pointer: MouseEvent | null = null;
  const keydown = (event: KeyboardEvent) => keys.set(event.code, event.key);
  const keyup = (event: KeyboardEvent) => keys.delete(event.code);
  const mouse = (event: MouseEvent) => { pointer = event.buttons ? event : null; };
  const release = () => {
    const canvas = target.querySelector("canvas");
    for (const [code, key] of keys) {
      canvas?.dispatchEvent(new KeyboardEvent("keyup", { code, key, bubbles: true }));
    }
    keys.clear();
    if (pointer) {
      canvas?.dispatchEvent(new MouseEvent("mouseup", {
        clientX: pointer.clientX, clientY: pointer.clientY, buttons: 0, bubbles: true,
      }));
      pointer = null;
    }
  };
  target.addEventListener("keydown", keydown, true);
  target.addEventListener("keyup", keyup, true);
  target.addEventListener("mousedown", mouse, true);
  target.addEventListener("mousemove", mouse, true);
  target.addEventListener("focusout", release);
  window.addEventListener("mouseup", mouse, true);
  window.addEventListener("blur", release, true);
  return {
    release,
    dispose() {
      release();
      target.removeEventListener("keydown", keydown, true);
      target.removeEventListener("keyup", keyup, true);
      target.removeEventListener("mousedown", mouse, true);
      target.removeEventListener("mousemove", mouse, true);
      target.removeEventListener("focusout", release);
      window.removeEventListener("mouseup", mouse, true);
      window.removeEventListener("blur", release, true);
    },
  };
}
