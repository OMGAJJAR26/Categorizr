import { useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { defaultEntityIndex, entityPeriodSummary } from "../../utils/periodStats";
import { classifySwipe } from "../../utils/swipeGesture";

// State and gestures shared by every summary card (merchant, payment method, expense
// category, tax type):
//
//   swipe left / right  -> next / previous item (A to Z, wrapping round)
//   swipe down          -> one month / quarter / year back
//   swipe up            -> back to the current month / quarter / year
//
// The same moves are on the arrow keys, and each card also shows buttons for them, because
// a mouse or a screen reader cannot swipe.

// How new content slides in: sideways for a new item, vertically for a new period.
export const slideVariants = {
  enter: ({ x, y, still }) => ({ opacity: 0, x: still ? 0 : x * 28, y: still ? 0 : y * 14 }),
  center: { opacity: 1, x: 0, y: 0 },
};

export const receiptsLabel = (n) => `${n} ${n === 1 ? "receipt" : "receipts"}`;

export function useSummaryCard({ receipts, dimension, entities, noun, formatCurrency }) {
  const reduceMotion = useReducedMotion();
  const [selectedKey, setSelectedKey] = useState(null);
  const [kind, setKind] = useState("M");
  const [offset, setOffset] = useState(0);
  const [dir, setDir] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  const count = entities.length;
  // Until the user swipes, open on the first item (A to Z) that has a receipt this month.
  const startIndex = useMemo(
    () => defaultEntityIndex(receipts, dimension, entities),
    [receipts, dimension, entities],
  );
  const found = entities.findIndex((e) => e.key === selectedKey);
  const index = found === -1 ? startIndex : found;
  const entity = entities[index];

  const goEntity = (step) => {
    if (count < 2) return;
    setDir({ x: step, y: 0 });
    setSelectedKey(entities[(index + step + count) % count].key);
  };
  const goPeriod = (nextOffset) => {
    if (nextOffset === offset) return;
    setDir({ x: 0, y: nextOffset < offset ? -1 : 1 });
    setOffset(nextOffset);
  };
  const chooseKind = (nextKind) => {
    if (nextKind === kind) return;
    setDir({ x: 0, y: 0 });
    setKind(nextKind);
    setOffset(0); // a new unit starts from "now"
  };

  const run = (direction) => {
    if (direction === "left") goEntity(1);
    else if (direction === "right") goEntity(-1);
    else if (direction === "down") goPeriod(offset - 1);
    else if (direction === "up") goPeriod(0);
  };

  const rootProps = {
    role: "group",
    "aria-roledescription": "carousel",
    "aria-label": `${noun} totals`,
    tabIndex: 0,
    style: { touchAction: "none" }, // vertical swipes belong to the card, not the page scroll
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target.closest("[data-no-swipe]")) return;
      drag.current = { x: e.clientX, y: e.clientY };
      try {
        // Keep receiving the drag if the pointer leaves the card (mouse drags).
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable (e.g. a synthetic event); the drag still works inside the card */
      }
    },
    onPointerUp: (e) => {
      const start = drag.current;
      drag.current = null;
      if (!start) return;
      run(classifySwipe(e.clientX - start.x, e.clientY - start.y));
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onKeyDown: (e) => {
      if (e.target.closest("[data-no-swipe]") && e.target !== e.currentTarget) return;
      const map = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "down", ArrowUp: "up" };
      if (!map[e.key]) return;
      e.preventDefault();
      run(map[e.key]);
    },
  };

  const summary = entity ? entityPeriodSummary(receipts, dimension, entity.key, kind, offset) : null;

  // Props for a block that should slide in whenever `key` changes.
  const custom = { ...dir, still: !!reduceMotion };
  const slideProps = (key) => ({
    key,
    custom,
    variants: slideVariants,
    initial: dir.x || dir.y ? "enter" : false,
    animate: "center",
    transition: { duration: 0.16, ease: "easeOut" },
  });

  let spoken = "";
  if (entity && summary) {
    const { current, prior, yoy } = summary;
    spoken =
      `${entity.name}, ${current.label}: ${formatCurrency(current.total)}. ` +
      `${prior.label}: ${formatCurrency(prior.total)}. ` +
      (yoy === null
        ? "No prior-year comparison."
        : `${yoy >= 0 ? "Up" : "Down"} ${Math.abs(yoy).toFixed(1)} percent year over year.`);
  }

  return {
    entity,
    index,
    count,
    kind,
    offset,
    summary,
    spoken,
    rootProps,
    slideProps,
    goEntity,
    goPeriod,
    chooseKind,
  };
}
