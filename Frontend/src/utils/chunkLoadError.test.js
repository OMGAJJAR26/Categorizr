import test from "node:test";
import assert from "node:assert/strict";
import { isChunkLoadError } from "./chunkLoadError.js";

test("recognizes the failed-dynamic-import message from each browser", () => {
  assert.equal(
    isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x.test/assets/Settings-abc.js")),
    true
  );
  assert.equal(isChunkLoadError(new TypeError("error loading dynamically imported module")), true);
  assert.equal(isChunkLoadError(new TypeError("Importing a module script failed.")), true);
  assert.equal(isChunkLoadError(new Error("Unable to preload CSS for /assets/HomePage-x.css")), true);
  assert.equal(isChunkLoadError(new Error("Loading chunk 42 failed.")), true);
  assert.equal(isChunkLoadError(new Error("Loading CSS chunk abc failed")), true);
});

test("recognizes a ChunkLoadError by name and plain string messages", () => {
  const e = new Error("boom");
  e.name = "ChunkLoadError";
  assert.equal(isChunkLoadError(e), true);
  assert.equal(isChunkLoadError("Failed to fetch dynamically imported module"), true);
});

test("does not mistake ordinary errors for a chunk failure", () => {
  assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')")), false);
  assert.equal(isChunkLoadError(new Error("Network request failed")), false);
  assert.equal(isChunkLoadError(new Error("")), false);
  assert.equal(isChunkLoadError({}), false);
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError(undefined), false);
});
