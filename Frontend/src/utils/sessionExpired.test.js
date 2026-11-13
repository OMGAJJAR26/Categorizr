import test from "node:test";
import assert from "node:assert/strict";
import { isSessionExpiredResponse } from "./sessionExpired.js";

test("recognizes the backend's invalid-session reply", () => {
  assert.equal(isSessionExpiredResponse({ code: "010", message: "Session Token Invalid" }), true);
  assert.equal(isSessionExpiredResponse({ code: 10, message: "x" }), false);
  assert.equal(isSessionExpiredResponse({ code: 10 }), false);
  assert.equal(isSessionExpiredResponse({ code: "010" }), true);
  assert.equal(isSessionExpiredResponse({ error_code: " 010 " }), true);
});

test("recognizes a session message even without the code", () => {
  assert.equal(isSessionExpiredResponse({ message: "Session Token Invalid" }), true);
  assert.equal(isSessionExpiredResponse({ message: "session token expired" }), true);
  assert.equal(isSessionExpiredResponse({ msg: "Token is expired" }), true);
});

test("a normal receipt list or user object is never treated as expired", () => {
  assert.equal(isSessionExpiredResponse([]), false);
  assert.equal(isSessionExpiredResponse([{ code: "010", message: "Session Token Invalid" }]), false);
  assert.equal(isSessionExpiredResponse({ id: 7, email: "a@b.test", name: "Sam" }), false);
  assert.equal(isSessionExpiredResponse({ receipts: [] }), false);
  assert.equal(isSessionExpiredResponse({ code: "200", message: "ok" }), false);
});

test("other errors and odd values are not mistaken for an expired session", () => {
  assert.equal(isSessionExpiredResponse({ code: "500", message: "Server error" }), false);
  assert.equal(isSessionExpiredResponse({ message: "Merchant name is invalid" }), false);
  assert.equal(isSessionExpiredResponse({ message: 42 }), false);
  assert.equal(isSessionExpiredResponse(null), false);
  assert.equal(isSessionExpiredResponse(undefined), false);
  assert.equal(isSessionExpiredResponse("010"), false);
  assert.equal(isSessionExpiredResponse(10), false);
});
