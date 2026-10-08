import assert from "node:assert/strict";
import test from "node:test";

import { sortReceipts } from "./receiptSorting.js";

const DAY = 1_700_000_000;
const NEXT_DAY = DAY + 86400;
const NONE = { order: null, date: null, amount: null };

const names = (receipts) => receipts.map((r) => r.product_name || r.storeName);

test("same date and total sort by Describe Purchase, A to Z", () => {
  const receipts = [
    { id: 4, product_date: DAY, purchasePrice: 20, storeName: "Shoppers Drug Mart", product_name: "WebApp 1" },
    { id: 2, product_date: DAY, purchasePrice: "20.00", storeName: "Shoppers Drug Mart", product_name: "iPad 1" },
    { id: 3, product_date: DAY + 3600, purchasePrice: 20, storeName: "Shoppers Drug Mart", product_name: "iPhone 1" },
    { id: 1, product_date: DAY, purchasePrice: 20, storeName: "Shoppers Drug Mart", product_name: "Android 1" },
  ];

  const sorted = sortReceipts(receipts, NONE);
  assert.deepEqual(names(sorted), ["Android 1", "iPad 1", "iPhone 1", "WebApp 1"]);
});

test("newer date comes before a higher total on an older day", () => {
  const receipts = [
    { id: 1, product_date: DAY, purchasePrice: 100, storeName: "A", product_name: "Apple" },
    { id: 2, product_date: NEXT_DAY, purchasePrice: 1, storeName: "Z", product_name: "Zebra" },
  ];

  const sorted = sortReceipts(receipts, NONE);
  assert.deepEqual(sorted.map((r) => r.id), [2, 1]);
});

test("same date orders highest total first, ahead of alphabetical description", () => {
  const receipts = [
    { id: 1, product_date: DAY, purchasePrice: 5, storeName: "Shop", product_name: "Apple" },
    { id: 2, product_date: DAY, purchasePrice: 50, storeName: "Shop", product_name: "Zebra" },
  ];

  const sorted = sortReceipts(receipts, NONE);
  assert.deepEqual(sorted.map((r) => r.id), [2, 1]);
});

test("blank Describe Purchase sorts by the merchant name shown on the list", () => {
  const receipts = [
    { id: 1, product_date: DAY, purchasePrice: 10, storeName: "Walmart", product_name: "" },
    { id: 2, product_date: DAY, purchasePrice: 10, storeName: "Costco", product_name: "0" },
    { id: 3, product_date: DAY, purchasePrice: 10, storeName: "Shoppers Drug Mart", product_name: "Android 1" },
  ];

  const sorted = sortReceipts(receipts, NONE);
  assert.deepEqual(sorted.map((r) => r.id), [3, 2, 1]);
});

test("same description then sorts by merchant name", () => {
  const receipts = [
    { id: 1, product_date: DAY, purchasePrice: 10, storeName: "Tim Hortons", product_name: "Lunch" },
    { id: 2, product_date: DAY, purchasePrice: 10, storeName: "Starbucks", product_name: "Lunch" },
  ];

  const sorted = sortReceipts(receipts, NONE);
  assert.deepEqual(sorted.map((r) => r.storeName), ["Starbucks", "Tim Hortons"]);
});

test("identical receipts keep a stable newest-id order", () => {
  const receipts = [
    { id: 10, product_date: DAY, purchasePrice: 10, storeName: "Shop", product_name: "Same" },
    { id: 30, product_date: DAY, purchasePrice: 10, storeName: "Shop", product_name: "Same" },
    { id: 20, product_date: DAY, purchasePrice: 10, storeName: "Shop", product_name: "same" },
  ];

  const forward = sortReceipts(receipts, NONE).map((r) => r.id);
  const backward = sortReceipts([...receipts].reverse(), NONE).map((r) => r.id);
  assert.deepEqual(forward, [30, 20, 10]);
  assert.deepEqual(backward, forward);
});
