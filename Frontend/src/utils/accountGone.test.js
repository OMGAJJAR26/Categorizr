import test from "node:test";
import assert from "node:assert/strict";
import { isAccountGoneResponse, classifyAuthFailure } from "./accountGone.js";

test("recognizes replies that say the account no longer exists", () => {
  for (const message of [
    "User not found",
    "Account has been deleted",
    "This user account is deactivated",
    "User does not exist",
    "The account was removed",
    "Account not found",
    "Deleted account",
    "user already deleted",
    "User account is disabled",
  ]) {
    assert.equal(isAccountGoneResponse({ code: "x", message }), true, message);
  }
  assert.equal(isAccountGoneResponse({ msg: "User not found" }), true);
});

test("ordinary replies are never mistaken for a deleted account", () => {
  for (const message of [
    "Incorrect Username or Password",
    "Session Token Invalid",
    "Merchant not found",
    "Store not found",
    "Receipt deleted successfully",
    "User store deleted successfully",
    "Tax removed",
    "Email or username is required",
  ]) {
    assert.equal(isAccountGoneResponse({ code: "x", message }), false, message);
  }
});

test("lists, user objects and odd values are ignored", () => {
  assert.equal(isAccountGoneResponse([]), false);
  assert.equal(isAccountGoneResponse([{ message: "User not found" }]), false);
  assert.equal(isAccountGoneResponse({ id: 7, userName: "sam", email: "a@b.test" }), false);
  assert.equal(isAccountGoneResponse({ message: 42 }), false);
  assert.equal(isAccountGoneResponse(null), false);
  assert.equal(isAccountGoneResponse(undefined), false);
  assert.equal(isAccountGoneResponse("User not found"), false);
});

test("classifyAuthFailure tells a deleted account from an expired session", () => {
  assert.equal(classifyAuthFailure({ code: "010", message: "Session Token Invalid" }), "expired");
  assert.equal(classifyAuthFailure({ code: "999", message: "Account has been deleted" }), "gone");
  assert.equal(classifyAuthFailure({ code: "003", message: "Incorrect Username or Password" }), null);
  assert.equal(classifyAuthFailure([]), null);
  assert.equal(classifyAuthFailure(null), null);
});
