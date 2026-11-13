import test from "node:test";
import assert from "node:assert/strict";
import { importWithReload } from "./lazyWithReload.js";

const makeStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
};
const failing = () => Promise.reject(new Error("chunk gone"));
const settledWithin = (p, ms = 30) =>
  Promise.race([p.then(() => "settled", () => "settled"), new Promise((r) => setTimeout(() => r("pending"), ms))]);

test("passes a successful import through without reloading", async () => {
  let reloads = 0;
  const mod = await importWithReload(() => Promise.resolve({ default: "page" }), {
    storage: makeStorage(),
    reload: () => reloads++,
  });
  assert.deepEqual(mod, { default: "page" });
  assert.equal(reloads, 0);
});

test("reloads once on the first chunk failure and stays pending", async () => {
  let reloads = 0;
  const storage = makeStorage();
  const p = importWithReload(failing, { storage, reload: () => reloads++, now: () => 1_000_000 });
  assert.equal(await settledWithin(p), "pending");
  assert.equal(reloads, 1);
  assert.equal(storage.getItem("cat_chunk_reload_at"), "1000000");
});

test("does not reload again inside the cooldown, and rethrows the original error", async () => {
  let reloads = 0;
  const storage = makeStorage({ cat_chunk_reload_at: "1000000" });
  await assert.rejects(
    importWithReload(failing, { storage, reload: () => reloads++, now: () => 1_010_000 }),
    /chunk gone/
  );
  assert.equal(reloads, 0);
});

test("reloads again once the cooldown has passed", async () => {
  let reloads = 0;
  const storage = makeStorage({ cat_chunk_reload_at: "1000000" });
  const p = importWithReload(failing, { storage, reload: () => reloads++, now: () => 1_031_000 });
  assert.equal(await settledWithin(p), "pending");
  assert.equal(reloads, 1);
});

test("does not reload while offline", async () => {
  let reloads = 0;
  await assert.rejects(
    importWithReload(failing, { storage: makeStorage(), reload: () => reloads++, isOnline: () => false }),
    /chunk gone/
  );
  assert.equal(reloads, 0);
});

test("does not reload when sessionStorage is unavailable (avoids reload loops)", async () => {
  let reloads = 0;
  await assert.rejects(importWithReload(failing, { storage: null, reload: () => reloads++ }), /chunk gone/);
  assert.equal(reloads, 0);
});

test("does not reload when sessionStorage throws on write", async () => {
  let reloads = 0;
  const storage = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  await assert.rejects(importWithReload(failing, { storage, reload: () => reloads++ }), /chunk gone/);
  assert.equal(reloads, 0);
});
