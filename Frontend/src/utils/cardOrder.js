// The order of the home-page cards, as a list of card ids. Pure helpers so the rules can be
// tested: saved orders may be old (missing a newer card, or naming one that no longer
// exists), and hidden cards must keep their place while the visible ones are rearranged.

// Saved order first (dropping unknown or repeated ids), then any card the saved order
// lacks, in its default position order.
export function normalizeOrder(saved, defaultIds) {
  const known = new Set(defaultIds);
  const seen = new Set();
  const kept = (Array.isArray(saved) ? saved : []).filter((id) => {
    if (!known.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return [...kept, ...defaultIds.filter((id) => !seen.has(id))];
}

// The user rearranged only the visible cards (`reordered`). Put them back into the full
// order in the slots the visible cards occupied; hidden cards do not move.
export function mergeVisibleOrder(fullOrder, reordered) {
  const visible = new Set(reordered);
  let next = 0;
  return fullOrder.map((id) => (visible.has(id) ? reordered[next++] : id));
}

// Move one card `delta` places among the given visible ids (keyboard reordering).
// Returns the new visible order, or the same one if it cannot move that way.
export function moveWithin(visibleIds, id, delta) {
  const from = visibleIds.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= visibleIds.length) return visibleIds;
  const next = [...visibleIds];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export const sameOrder = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
