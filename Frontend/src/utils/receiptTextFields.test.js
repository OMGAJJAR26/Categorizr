import assert from "node:assert/strict";
import test from "node:test";

import {
  CLEAR_TEXT_API_VALUE,
  descriptionWithoutMerchantEcho,
  fromApiTextValue,
  receiptDescription,
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

test("receiptDescription shows only the stored description, never the merchant name", () => {
  assert.equal(receiptDescription({ product_name: "Team lunch", storeName: "Home Depot" }), "Team lunch");
  assert.equal(receiptDescription({ product_name: "  Tools  ", storeName: "Home Depot" }), "Tools");
  assert.equal(receiptDescription({ productName: "Paint", storeName: "Lowe's" }), "Paint");
});

test("receiptDescription is empty when no description was added", () => {
  for (const receipt of [
    { storeName: "Home Depot" },
    { product_name: "", storeName: "Home Depot" },
    { product_name: "   ", storeName: "Home Depot" },
    { product_name: null, storeName: "Home Depot" },
    { product_name: "0", storeName: "Home Depot" }, // the legacy "cleared" marker
    {},
  ]) {
    assert.equal(receiptDescription(receipt), "", JSON.stringify(receipt));
  }
  assert.equal(receiptDescription(null), "");
  assert.equal(receiptDescription(undefined), "");
});

test("a description the user wrote that happens to match the merchant is still shown", () => {
  assert.equal(receiptDescription({ product_name: "Home Depot", storeName: "Home Depot" }), "Home Depot");
});

test("descriptionWithoutMerchantEcho drops a scanned description that just repeats the merchant", () => {
  assert.equal(descriptionWithoutMerchantEcho("Home Depot", "Home Depot"), "");
  assert.equal(descriptionWithoutMerchantEcho("  home depot ", "HOME DEPOT"), "");
  assert.equal(descriptionWithoutMerchantEcho("Dillard's", "Miscellaneous", "Dillard's"), "");
});

test("descriptionWithoutMerchantEcho keeps real descriptions and blanks", () => {
  assert.equal(descriptionWithoutMerchantEcho("Tools and supplies", "Home Depot"), "Tools and supplies");
  assert.equal(descriptionWithoutMerchantEcho("Home Depot run", "Home Depot"), "Home Depot run");
  assert.equal(descriptionWithoutMerchantEcho("", "Home Depot"), "");
  assert.equal(descriptionWithoutMerchantEcho("", ""), "");
  assert.equal(descriptionWithoutMerchantEcho("Tools"), "Tools");
});
