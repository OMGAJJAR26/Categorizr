import assert from "node:assert/strict";
import test from "node:test";

import {
  CLEAR_TEXT_API_VALUE,
  fromApiTextValue,
  toApiTextValue,
} from "./receiptTextFields.js";

test("toApiTextValue sends empty string (never '0') for blank input", () => {
  assert.equal(toApiTextValue(""), "");
  assert.equal(toApiTextValue("   "), "");
  assert.equal(toApiTextValue(null), "");
  assert.equal(toApiTextValue(undefined), "");
  // The old "0" sentinel must never go out — mobile shows it literally.
  assert.notEqual(toApiTextValue(""), CLEAR_TEXT_API_VALUE);
});

test("toApiTextValue passes real descriptions through untouched", () => {
  assert.equal(toApiTextValue("Garden hose and fittings"), "Garden hose and fittings");
  // Leading/trailing spaces are only inspected, never stripped.
  assert.equal(toApiTextValue("  spaced out  "), "  spaced out  ");
});

test("toApiTextValue keeps a description that merely contains a zero", () => {
  assert.equal(toApiTextValue("10 bags of mulch"), "10 bags of mulch");
  assert.equal(toApiTextValue("0 rated fuse"), "0 rated fuse");
});

test("fromApiTextValue reads the clear sentinel back as empty", () => {
  assert.equal(fromApiTextValue("0"), "");
  assert.equal(fromApiTextValue(" 0 "), "");
});

test("fromApiTextValue leaves real content alone", () => {
  assert.equal(fromApiTextValue("Garden hose and fittings"), "Garden hose and fittings");
  assert.equal(fromApiTextValue("0 rated fuse"), "0 rated fuse");
  assert.equal(fromApiTextValue("100"), "100");
});

test("fromApiTextValue normalises missing values to empty", () => {
  assert.equal(fromApiTextValue(null), "");
  assert.equal(fromApiTextValue(undefined), "");
  assert.equal(fromApiTextValue(""), "");
});

test("clearing then reading round-trips to empty", () => {
  assert.equal(fromApiTextValue(toApiTextValue("")), "");
});

test("a real description round-trips unchanged", () => {
  const text = "Two litres of paint";
  assert.equal(fromApiTextValue(toApiTextValue(text)), text);
});
