import { useLayoutEffect } from "react";

const EDGE_GAP = 8;

// Dropdowns are positioned relative to their (small) trigger icon, so on a narrow
// phone they can run off the left or right edge of the screen. After the panel
// opens, shift it back inside the viewport. `translate` is used (not `transform`)
// so it does not fight the open/close animation.
export function useKeepInViewport(panelRef, isOpen) {
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!isOpen || !el) return;
    el.style.translate = "";
    const { left, right } = el.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    let shift = 0;
    if (left < EDGE_GAP) shift = EDGE_GAP - left;
    else if (right > viewportWidth - EDGE_GAP) shift = viewportWidth - EDGE_GAP - right;
    if (shift) el.style.translate = `${Math.round(shift)}px 0`;
  }, [panelRef, isOpen]);
}
