import test from "node:test";
import assert from "node:assert/strict";
import { mergeVisibleOrder, moveWithin, normalizeOrder, sameOrder } from "./cardOrder.js";

const DEFAULT = ["expenseType", "merchant", "payment", "category", "tax"];

test("a saved order is kept; unknown and repeated ids are dropped", () => {
  assert.deepEqual(normalizeOrder(["tax", "merchant", "ghost", "tax"], DEFAULT), [
    "tax", "merchant", "expenseType", "payment", "category",
  ]);
});

test("cards missing from an old saved order are added at the end", () => {
  assert.deepEqual(normalizeOrder(["payment", "merchant"], DEFAULT), [
    "payment", "merchant", "expenseType", "category", "tax",
  ]);
});

test("no or broken saved order gives the default", () => {
  assert.deepEqual(normalizeOrder(null, DEFAULT), DEFAULT);
  assert.deepEqual(normalizeOrder("nope", DEFAULT), DEFAULT);
  assert.deepEqual(normalizeOrder([], DEFAULT), DEFAULT);
});

test("rearranging the visible cards leaves hidden cards in place", () => {
  // payment is hidden; the visible four are reordered
  const full = ["expenseType", "merchant", "payment", "category", "tax"];
  const reordered = ["tax", "merchant", "expenseType", "category"];
  assert.deepEqual(mergeVisibleOrder(full, reordered), ["tax", "merchant", "payment", "expenseType", "category"]);
});

test("keyboard move stays inside the visible list", () => {
  const v = ["a", "b", "c"];
  assert.deepEqual(moveWithin(v, "b", 1), ["a", "c", "b"]);
  assert.deepEqual(moveWithin(v, "b", -1), ["b", "a", "c"]);
  assert.equal(moveWithin(v, "a", -1), v);
  assert.equal(moveWithin(v, "c", 1), v);
  assert.equal(moveWithin(v, "zzz", 1), v);
});

test("sameOrder compares lists", () => {
  assert.equal(sameOrder(["a", "b"], ["a", "b"]), true);
  assert.equal(sameOrder(["a", "b"], ["b", "a"]), false);
  assert.equal(sameOrder(["a"], ["a", "b"]), false);
});
