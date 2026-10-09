import assert from "node:assert/strict";
import test from "node:test";

import { prepareLegacyReceiptBody } from "./legacyReceiptWrite.js";

test("receipt writes keep the merchant name and adapt only concatenated fields", () => {
  const body = {
    storeName: "Lowe's",
    product_name: "Lowe's paint",
    notes: "don't forget",
    expense_type: "Mom's Retail",
    paymentType: "O'Brien Visa",
    card_issuer_name: "O'Brien Bank",
  };
  const prepared = prepareLegacyReceiptBody(body);
  assert.equal(prepared.storeName, "Lowe's");
  assert.equal(prepared.product_name, "Lowe''s paint");
  assert.equal(prepared.notes, "don''t forget");
  assert.equal(prepared.expense_type, "Mom''s Retail");
  assert.equal(prepared.paymentType, "O''Brien Visa");
  assert.equal(prepared.card_issuer_name, "O''Brien Bank");
  assert.equal(body.product_name, "Lowe's paint");
  assert.equal(body.notes, "don't forget");
});

test("forward also adapts the merchant name and tax names", () => {
  const prepared = prepareLegacyReceiptBody(
    {
      storeName: "McDonald's",
      product_name: "McDonald's fries",
      notes: "don't forget",
      receipt_tax_values: [{ tax_name: "Mom's GST", tax_rate: "5" }],
    },
    { includeStoreName: true }
  );
  assert.equal(prepared.storeName, "McDonald''s");
  assert.equal(prepared.product_name, "McDonald''s fries");
  assert.equal(prepared.notes, "don''t forget");
  assert.equal(prepared.receipt_tax_values[0].tax_name, "Mom''s GST");
});
