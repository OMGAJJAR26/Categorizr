import test from "node:test";
import assert from "node:assert/strict";
import {
  periodRange,
  sameperiodLastYear,
  yoyPercent,
  listEntities,
  entityPeriodSummary,
  defaultEntityIndex,
  merchantDimension,
  categoryDimension,
  expenseTypeDimension,
  earliestOffset,
  shortPeriodLabel,
  periodSubtitle,
  paymentDimension,
  taxDimension,
} from "./periodStats.js";
import { classifySwipe } from "./swipeGesture.js";

const NOW = new Date(2026, 10, 18, 12); // 18 Nov 2026, local
const unix = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d, 12) / 1000);
const rc = (storeName, price, y, m, d, extra = {}) => ({
  storeName,
  purchasePrice: String(price),
  product_date: unix(y, m, d),
  ...extra,
});

test("current month, quarter and year", () => {
  const m = periodRange("M", 0, NOW);
  assert.equal(m.label, "Nov 2026");
  assert.equal(m.startMs, Date.UTC(2026, 10, 1));
  assert.equal(m.endMs, Date.UTC(2026, 11, 1));

  const q = periodRange("Q", 0, NOW);
  assert.equal(q.label, "Q4 2026");
  assert.equal(q.detail, "Oct – Dec");
  assert.equal(q.startMs, Date.UTC(2026, 9, 1));
  assert.equal(q.endMs, Date.UTC(2027, 0, 1));

  const y = periodRange("Y", 0, NOW);
  assert.equal(y.label, "2026");
  assert.equal(y.startMs, Date.UTC(2026, 0, 1));
  assert.equal(y.endMs, Date.UTC(2027, 0, 1));
});

test("going back crosses year boundaries", () => {
  assert.equal(periodRange("M", -10, NOW).label, "Jan 2026");
  assert.equal(periodRange("M", -11, NOW).label, "Dec 2025");
  assert.equal(periodRange("Q", -1, NOW).label, "Q3 2026");
  assert.equal(periodRange("Q", -4, NOW).label, "Q4 2025");
  assert.equal(periodRange("Q", -4, NOW).startMs, Date.UTC(2025, 9, 1));
  assert.equal(periodRange("Y", -1, NOW).label, "2025");
});

test("the comparison period is the same one a year earlier", () => {
  assert.equal(sameperiodLastYear(periodRange("M", 0, NOW)).label, "Nov 2025");
  const q = sameperiodLastYear(periodRange("Q", 0, NOW));
  assert.equal(q.label, "Q4 2025");
  assert.equal(q.startMs, Date.UTC(2025, 9, 1));
  assert.equal(q.endMs, Date.UTC(2026, 0, 1));
  assert.equal(sameperiodLastYear(periodRange("Y", 0, NOW)).label, "2025");
});

test("YoY percentage: (current - prior) / prior * 100", () => {
  assert.equal(yoyPercent(1500, 1000), 50);
  assert.equal(yoyPercent(750, 1000), -25);
  assert.equal(yoyPercent(520, 450).toFixed(1), "15.6");
  assert.equal(yoyPercent(100, 0), null);
  assert.equal(yoyPercent(0, 0), null);
});

const RECEIPTS = [
  rc("Home Depot", 1000, 2026, 11, 3),
  rc("Home Depot", 500, 2026, 11, 30),
  rc("Home Depot", 200, 2026, 10, 31), // October: in the quarter, not the month
  rc("Home Depot", 1000, 2025, 11, 1),
  rc("Home Depot", 3000, 2025, 12, 1), // December 2025: not November 2025
  rc("home depot ", 100, 2026, 11, 5), // same store, different spelling
  rc("Target", 40, 2026, 11, 7),
  rc("Target", 99, 2026, 11, 7, { product_date: 0 }), // undated: never counted
  rc("", 5, 2026, 11, 7), // no merchant: not listed
];

test("merchants are listed once each, A to Z", () => {
  const list = listEntities(RECEIPTS, merchantDimension);
  assert.deepEqual(list.map((m) => m.name), ["Home Depot", "Target"]);
});

test("month, quarter and year totals with YoY", () => {
  const key = listEntities(RECEIPTS, merchantDimension)[0].key;

  const month = entityPeriodSummary(RECEIPTS, merchantDimension, key, "M", 0, NOW);
  assert.equal(month.current.total, 1600);
  assert.equal(month.current.count, 3);
  assert.equal(month.prior.total, 1000);
  assert.equal(month.prior.count, 1);
  assert.equal(month.yoy, 60);

  const quarter = entityPeriodSummary(RECEIPTS, merchantDimension, key, "Q", 0, NOW);
  assert.equal(quarter.current.total, 1800);
  assert.equal(quarter.prior.total, 4000);

  const year = entityPeriodSummary(RECEIPTS, merchantDimension, key, "Y", 0, NOW);
  assert.equal(year.current.total, 1800);
  assert.equal(year.prior.total, 4000);
});

test("going back one month compares October with October a year earlier", () => {
  const key = listEntities(RECEIPTS, merchantDimension)[0].key;
  const oct = entityPeriodSummary(RECEIPTS, merchantDimension, key, "M", -1, NOW);
  assert.equal(oct.current.label, "Oct 2026");
  assert.equal(oct.current.total, 200);
  assert.equal(oct.prior.label, "Oct 2025");
  assert.equal(oct.prior.total, 0);
  assert.equal(oct.yoy, null);
});

test("the card opens on the first merchant that has a receipt this month", () => {
  const rs = [rc("Apple", 5, 2025, 1, 1), rc("Zed", 9, 2026, 11, 2)];
  const list = listEntities(rs, merchantDimension);
  assert.equal(defaultEntityIndex(rs, merchantDimension, list, NOW), 1);
  const old = [rc("Apple", 5, 2025, 1, 1)];
  assert.equal(defaultEntityIndex(old, merchantDimension, listEntities(old, merchantDimension), NOW), 0);
});

const withCat = (cat, price, y, m, d) => ({ ...rc("Shop", price, y, m, d), expense_type: cat });

test("expense categories: grouped by name, uncategorised receipts skipped", () => {
  const rs = [
    withCat("Groceries", 520, 2026, 11, 3),
    withCat("groceries ", 0, 2026, 11, 1),
    withCat("Groceries", 450, 2025, 11, 3),
    withCat("Travel", 90, 2026, 11, 3),
    withCat("0", 70, 2026, 11, 3),
    withCat("", 70, 2026, 11, 3),
  ];
  const list = listEntities(rs, categoryDimension);
  assert.deepEqual(list.map((e) => e.name), ["Groceries", "Travel"]);
  const g = entityPeriodSummary(rs, categoryDimension, list[0].key, "M", 0, NOW);
  assert.equal(g.current.total, 520);
  assert.equal(g.current.count, 2);
  assert.equal(g.prior.total, 450);
  assert.equal(g.yoy.toFixed(1), "15.6");
});

test("payment methods: grouped by the app's label", () => {
  const label = (r) => r.pay;
  const dim = paymentDimension(label);
  const rs = [
    { ...rc("A", 3000, 2026, 11, 3), pay: "Visa *4242" },
    { ...rc("A", 2400, 2025, 11, 3), pay: "visa *4242" },
    { ...rc("A", 10, 2026, 11, 3), pay: "Cash" },
    { ...rc("A", 10, 2026, 11, 3), pay: "—" },
  ];
  const list = listEntities(rs, dim);
  assert.deepEqual(list.map((e) => e.name), ["Cash", "Visa *4242"]);
  const visa = entityPeriodSummary(rs, dim, list[1].key, "M", 0, NOW);
  assert.equal(visa.current.total, 3000);
  assert.equal(visa.prior.total, 2400);
  assert.equal(visa.yoy, 25);
});

test("tax types: add up the tax amount lines, ignore tips", () => {
  const tx = (price, y, m, d, lines) => ({ ...rc("S", price, y, m, d), receipt_tax_values: lines });
  const rs = [
    tx(1000, 2026, 11, 3, [{ tax_name: "HST", tax_amount: "100.00" }, { tax_name: "Tip", tax_amount: "50" }]),
    tx(500, 2026, 11, 9, [{ tax_name: "HST", tax_amount: "62.50" }, { tax_name: "GST", tax_amount: "25" }]),
    tx(900, 2025, 11, 9, [{ tax_name: "hst", tax_amount: "130.00" }]),
    tx(100, 2026, 11, 9, []),
  ];
  const list = listEntities(rs, taxDimension);
  assert.deepEqual(list.map((e) => e.name), ["GST", "HST"]);
  const hst = entityPeriodSummary(rs, taxDimension, list[1].key, "M", 0, NOW);
  assert.equal(hst.current.total, 162.5);
  assert.equal(hst.current.count, 2);
  assert.equal(hst.prior.total, 130);
  assert.equal(hst.yoy, 25);
});

test("how far back a card may go: the oldest receipt's period, ignoring bad dates", () => {
  const rs = [rc("A", 1, 2024, 3, 3), rc("A", 1, 2026, 1, 1), { ...rc("A", 1, 1971, 1, 1) }];
  assert.equal(earliestOffset(rs, "Y", NOW), -2); // 2024
  assert.equal(earliestOffset(rs, "Q", NOW), -11); // Q1 2024 is 11 quarters before Q4 2026
  assert.equal(earliestOffset(rs, "M", NOW), -32); // Mar 2024 is 32 months before Nov 2026
  assert.equal(earliestOffset([], "Y", NOW), 0);
  assert.equal(earliestOffset([rc("A", 1, 2027, 5, 1)], "Y", NOW), 0); // only future dates
});

test("short labels for the jump buttons", () => {
  assert.equal(shortPeriodLabel("Y", -1, NOW), "2025");
  assert.equal(shortPeriodLabel("Y", 0, NOW), "2026");
  assert.equal(shortPeriodLabel("M", 0, NOW), "Nov");
  assert.equal(shortPeriodLabel("M", -1, NOW), "Oct");
  assert.equal(shortPeriodLabel("M", -11, NOW), "Dec ’25");
  assert.equal(shortPeriodLabel("Q", 0, NOW), "Q4");
  assert.equal(shortPeriodLabel("Q", -2, NOW), "Q2");
  assert.equal(shortPeriodLabel("Q", -4, NOW), "Q4 ’25");
});

test("subtitles under the item name", () => {
  assert.equal(periodSubtitle(periodRange("Y", 0, NOW)), "Yearly · Jan – Dec");
  assert.equal(periodSubtitle(periodRange("Q", 0, NOW)), "Quarterly · Oct – Dec");
  assert.equal(periodSubtitle(periodRange("M", 0, NOW)), "Monthly · Nov 1 – 30");
  assert.equal(periodSubtitle(periodRange("M", -9, NOW)), "Monthly · Feb 1 – 28");
});

test("expense types: Personal (0) and Business (1) only", () => {
  const rs = [
    { ...rc("A", 10, 2026, 11, 3), receipt_category: "0" },
    { ...rc("A", 30, 2026, 11, 4), receipt_category: "1" },
    { ...rc("A", 5, 2026, 11, 5), receipt_category: "2" },
    { ...rc("A", 7, 2026, 11, 5), receipt_category: "" },
  ];
  const list = listEntities(rs, expenseTypeDimension);
  assert.deepEqual(list.map((e) => e.name), ["Business", "Personal"]);
  assert.equal(entityPeriodSummary(rs, expenseTypeDimension, "business", "M", 0, NOW).current.total, 30);
});

test("swipe directions", () => {
  assert.equal(classifySwipe(-80, 5), "left");
  assert.equal(classifySwipe(80, -5), "right");
  assert.equal(classifySwipe(3, 70), "down");
  assert.equal(classifySwipe(-3, -70), "up");
  assert.equal(classifySwipe(10, 10), null); // a tap
  assert.equal(classifySwipe(60, 55), null); // diagonal
});
