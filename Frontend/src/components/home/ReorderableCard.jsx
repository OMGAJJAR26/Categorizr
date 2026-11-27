import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";

const HOLD_MS = 450; // how long to press before the card lifts
const SLOP_PX = 8; // moving more than this first means "swipe", not "press and hold"

// One card in the rearrangeable row. Press and hold it (about half a second) and it lifts;
// then drag it to a new place and let go. A quick swipe or tap still works as usual
// because the card only lifts if the pointer stayed put for the whole hold.
//
// `onLift(true | false)` tells the row a card is being moved (so it can scroll along),
// and `onMove(delta)` is the keyboard way: Alt + arrow keys.
const ReorderableCard = ({ id, className = "", children, onLift, onMove }) => {
  const controls = useDragControls();
  const [lifted, setLifted] = useState(false);
  const press = useRef(null);

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };

  const drop = () => {
    setLifted(false);
    onLift?.(false);
  };

  // Once lifted, the press ends wherever the finger or mouse is released (even with no
  // movement, when the drag itself never starts).
  useEffect(() => {
    if (!lifted) return undefined;
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
    return () => {
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", drop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifted]);

  useEffect(() => cancelPress, []);

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest("[data-no-swipe]")) return; // buttons keep their own behaviour
    cancelPress();
    const native = e.nativeEvent;
    press.current = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        press.current = null;
        setLifted(true);
        onLift?.(true);
        try {
          navigator.vibrate?.(12);
        } catch {
          /* no haptics here */
        }
        controls.start(native);
      }, HOLD_MS),
    };
  };

  const onPointerMove = (e) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP_PX) cancelPress();
  };

  const onKeyDownCapture = (e) => {
    if (!e.altKey) return;
    const delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation(); // do not also move the card's own item / period
    onMove?.(id, delta);
  };

  return (
    <Reorder.Item
      as="div"
      value={id}
      dragListener={false}
      dragControls={controls}
      data-reordering={lifted}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => {
        // A long press on a touch screen can open the browser's menu; not while holding a card.
        if (press.current || lifted) e.preventDefault();
      }}
      onKeyDownCapture={onKeyDownCapture}
      onDragEnd={drop}
      whileDrag={{ scale: 1.03, zIndex: 30, boxShadow: "0 22px 44px rgba(20,32,63,0.28)" }}
      transition={{ type: "spring", stiffness: 520, damping: 38 }}
      style={{ position: "relative", touchAction: "none" }}
      className={`${className} ${lifted ? "cursor-grabbing" : ""}`}
    >
      {children}
    </Reorder.Item>
  );
};

export default ReorderableCard;
