import test from "node:test";
import assert from "node:assert/strict";
import { skeletonKeyForPath } from "./routeSkeleton.js";

test("each lazy page gets the skeleton that mirrors its layout", () => {
  assert.equal(skeletonKeyForPath("/homepage"), "home");
  assert.equal(skeletonKeyForPath("/receipt-gallery"), "gallery");
  assert.equal(skeletonKeyForPath("/settings"), "settings");
});

test("trailing slashes, query strings and hashes are ignored", () => {
  assert.equal(skeletonKeyForPath("/homepage/"), "home");
  assert.equal(skeletonKeyForPath("/settings?tab=network"), "settings");
  assert.equal(skeletonKeyForPath("/receipt-gallery#top"), "gallery");
});

test("the sign-in screens never get the signed-in header skeleton", () => {
  for (const p of ["/", "/login", "/signup", "/login/"]) {
    assert.equal(skeletonKeyForPath(p), "auth", p);
  }
});

test("other pages and odd input fall back to the generic skeleton", () => {
  for (const p of ["/receipt/42", "/summary-report", "/tax-report", "/nope"]) {
    assert.equal(skeletonKeyForPath(p), "generic", p);
  }
  assert.equal(skeletonKeyForPath(null), "auth");
  assert.equal(skeletonKeyForPath(undefined), "auth");
  assert.equal(skeletonKeyForPath(""), "auth");
});
