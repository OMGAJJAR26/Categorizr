import test from "node:test";
import assert from "node:assert/strict";
import {
  getReceiptStatusValue,
  isReceiptRead,
  isReceiptUnread,
  shouldMarkReceiptRead,
  isStatusUpdateSuccessful,
  isUnreadHighlightReceipt,
  isNewForwardedReceipt,
} from "./receiptReadState.js";

test("status values: 0 unread, 1 read, strings or numbers, missing counts as unread (-1)", () => {
  assert.equal(getReceiptStatusValue({ status: "0" }), 0);
  assert.equal(getReceiptStatusValue({ status: "1" }), 1);
  assert.equal(getReceiptStatusValue({ status: 1 }), 1);
  assert.equal(getReceiptStatusValue({ status: 0 }), 0);
  assert.equal(getReceiptStatusValue({ Status: "1" }), 1); // mobile forwards send "Status"
  assert.equal(getReceiptStatusValue({}), -1);
  assert.equal(getReceiptStatusValue({ status: "" }), -1);
  assert.equal(getReceiptStatusValue({ status: null }), -1);
  assert.equal(getReceiptStatusValue({ status: "abc" }), -1);
  assert.equal(getReceiptStatusValue(null), -1);
});

test("read/unread depends on the status flag only", () => {
  assert.equal(isReceiptRead({ status: "1" }), true);
  assert.equal(isReceiptUnread({ status: "1" }), false);
  assert.equal(isReceiptUnread({ status: "0" }), true);
  assert.equal(isReceiptUnread({}), true);
  assert.equal(isReceiptRead(null), true);
  assert.equal(isReceiptUnread(null), false);
});

test("is_verify and eReceipt fields never change read/unread", () => {
  const unverifiedEReceiptButRead = { status: "1", is_verify: "0", fk_incoming_email_id: "55" };
  assert.equal(isReceiptRead(unverifiedEReceiptButRead), true);
  const verifiedButUnread = { status: "0", is_verify: "1", fk_incoming_email_id: "55" };
  assert.equal(isReceiptUnread(verifiedButUnread), true);
});

test("opening marks a receipt read only when it has an id and is unread", () => {
  assert.equal(shouldMarkReceiptRead({ id: 7, status: "0" }), true);
  assert.equal(shouldMarkReceiptRead({ id: 7 }), true);
  assert.equal(shouldMarkReceiptRead({ id: 7, status: "1" }), false);
  assert.equal(shouldMarkReceiptRead({ status: "0" }), false);
  assert.equal(shouldMarkReceiptRead(null), false);
});

test("list highlight follows the flag: unread highlights, read does not, drafts never", () => {
  assert.equal(isUnreadHighlightReceipt({ id: 1, status: "0" }), true);
  assert.equal(isUnreadHighlightReceipt({ id: 1, status: "1" }), false);
  assert.equal(isUnreadHighlightReceipt({ id: 1 }), true);
  assert.equal(isUnreadHighlightReceipt({ id: 1, status: "0", is_draft: "1" }), false);
  // The case this change fixes: a read eReceipt that is still awaiting verification
  // used to be highlighted because of is_verify.
  assert.equal(
    isUnreadHighlightReceipt({ id: 1, status: "1", is_verify: "0", fk_incoming_email_id: "55" }),
    false
  );
});

test("received-forward highlight needs a network forward and an unread status", () => {
  assert.equal(isNewForwardedReceipt({ status: "0", fk_forward_from_receipt_id: "9" }), true);
  assert.equal(isNewForwardedReceipt({ status: "1", fk_forward_from_receipt_id: "9" }), false);
  assert.equal(isNewForwardedReceipt({ status: "0", fk_forward_from_receipt_id: "0" }), false);
  assert.equal(isNewForwardedReceipt({ status: "0", fk_forward_from_receipt_id: "9", is_draft: "1" }), false);
});

test("status update success check: HTTP errors and 200-with-error bodies are failures", () => {
  assert.equal(isStatusUpdateSuccessful(false, ""), false);
  assert.equal(isStatusUpdateSuccessful(false, '{"id":1}'), false);
  assert.equal(isStatusUpdateSuccessful(true, ""), true);
  assert.equal(isStatusUpdateSuccessful(true, "OK"), true);
  assert.equal(isStatusUpdateSuccessful(true, '{"id":12,"status":"1"}'), true);
  assert.equal(isStatusUpdateSuccessful(true, '{"code":"000","message":"done"}'), true);
  assert.equal(isStatusUpdateSuccessful(true, '{"message":"Receipt updated successfully"}'), true);
  assert.equal(isStatusUpdateSuccessful(true, '{"code":"010","message":"Session Token Invalid"}'), false);
  assert.equal(isStatusUpdateSuccessful(true, '{"message":"Receipt not found"}'), false);
  assert.equal(isStatusUpdateSuccessful(true, "[]"), true);
  assert.equal(isStatusUpdateSuccessful(true, "null"), true);
});
