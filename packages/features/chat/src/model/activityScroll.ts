const BOTTOM_THRESHOLD_PX = 16;

/**
 * Keeps a height-capped activity dropdown pinned to its latest output until the user scrolls up.
 * Scrolling back within `BOTTOM_THRESHOLD_PX` of the bottom seamlessly resumes auto-following.
 */
export function attachActivityBottomFollow(scroller: HTMLElement, content: HTMLElement): () => void {
  let sticky = true;
  let lastTop = scroller.scrollTop;
  let lastWritten: number | undefined;
  let initialFrame = 0;

  const distanceToBottom = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);

  const stickToEnd = () => {
    if (!sticky) return;
    const target = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (Math.abs(scroller.scrollTop - target) < 0.5) return;
    scroller.scrollTop = target;
    lastWritten = scroller.scrollTop;
    lastTop = scroller.scrollTop;
  };

  const onWheel = (event: WheelEvent) => {
    if (event.deltaY < 0 && scroller.scrollHeight > scroller.clientHeight) {
      sticky = false;
    }
  };

  const onScroll = () => {
    const now = scroller.scrollTop;
    const written = lastWritten;
    lastWritten = undefined;
    if (written !== undefined && Math.abs(now - written) < 1) {
      lastTop = now;
      return;
    }
    const distance = distanceToBottom();
    if (now < lastTop && distance > 4) {
      sticky = false;
    } else if (distance <= BOTTOM_THRESHOLD_PX) {
      sticky = true;
    }
    lastTop = now;
  };

  scroller.addEventListener("wheel", onWheel, { passive: true });
  scroller.addEventListener("scroll", onScroll, { passive: true });

  const observer = typeof ResizeObserver === "undefined"
    ? undefined
    : new ResizeObserver(() => {
        stickToEnd();
      });
  observer?.observe(content);

  // Snap to the bottom immediately on open, and again on the next animation frame after layout settles.
  stickToEnd();
  if (typeof requestAnimationFrame === "function") {
    initialFrame = requestAnimationFrame(() => stickToEnd());
  }

  return () => {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(initialFrame);
    scroller.removeEventListener("wheel", onWheel);
    scroller.removeEventListener("scroll", onScroll);
    observer?.disconnect();
  };
}
