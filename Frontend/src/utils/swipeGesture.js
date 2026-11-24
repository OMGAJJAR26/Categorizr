// Turns a finger / mouse drag (how far it moved sideways and up/down) into a swipe direction.
// The dominant axis wins, and a drag shorter than `threshold` px is a tap, not a swipe.
// "left" means the pointer moved left.
export function classifySwipe(dx, dy, threshold = 40, dominance = 1.3) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return null;
  if (ax >= ay * dominance) return dx < 0 ? "left" : "right";
  if (ay >= ax * dominance) return dy < 0 ? "up" : "down";
  return null; // too diagonal to call
}
