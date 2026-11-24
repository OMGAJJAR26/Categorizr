// Totals and year-over-year (YoY) figures for the home-page summary cards.
//
// A "period" is a calendar month, quarter or year, picked by a kind ("M" | "Q" | "Y") and an
// offset (0 = the current one, -1 = the one before it ...). Receipt dates are UTC calendar
// days (see receiptDate.js), so periods are measured in UTC days too, which keeps a receipt
// in the same month on every device. Only "which month is it now" comes from the local clock.
//
// Every card (merchant, payment method, expense category, tax type) uses the same maths and
// differs only in its "dimension": how a receipt is turned into the things it belongs to and
// the amount it adds to each.

import { normalizeMerchantKey, unescapeMerchantName } from "./merchantListUtils.js";

export const PERIOD_KINDS = ["M", "Q", "Y"];
export const PERIOD_NAMES = { M: "Month", Q: "Quarter", Y: "Year" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The period of `kind` that is `offset` steps from the one containing `now`.
// Returns the range in UTC ms ([startMs, endMs)) plus labels for display.
export function periodRange(kind, offset = 0, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();

  if (kind === "Y") {
    const y = year + offset;
    return {
      kind,
      startMs: Date.UTC(y, 0, 1),
      endMs: Date.UTC(y + 1, 0, 1),
      label: String(y),
      detail: "Jan – Dec",
    };
  }

  if (kind === "Q") {
    const startMonth = (Math.floor(month / 3) + offset) * 3; // Date.UTC rolls over years
    const start = new Date(Date.UTC(year, startMonth, 1));
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth();
    return {
      kind,
      startMs: Date.UTC(y, m, 1),
      endMs: Date.UTC(y, m + 3, 1),
      label: `Q${Math.floor(m / 3) + 1} ${y}`,
      detail: `${MONTHS[m]} – ${MONTHS[(m + 2) % 12]}`,
    };
  }

  const start = new Date(Date.UTC(year, month + offset, 1));
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  return {
    kind: "M",
    startMs: Date.UTC(y, m, 1),
    endMs: Date.UTC(y, m + 1, 1),
    label: `${MONTHS[m]} ${y}`,
    detail: "",
  };
}

// The same period one year earlier (Nov 2026 -> Nov 2025, Q4 2026 -> Q4 2025, 2026 -> 2025).
export function sameperiodLastYear(range) {
  const start = new Date(range.startMs);
  const end = new Date(range.endMs);
  const y = start.getUTCFullYear() - 1;
  const startMs = Date.UTC(y, start.getUTCMonth(), 1);
  const endMs = Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), 1);
  const label =
    range.kind === "Y"
      ? String(y)
      : range.kind === "Q"
        ? `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${y}`
        : `${MONTHS[start.getUTCMonth()]} ${y}`;
  return { ...range, startMs, endMs, label };
}

// (current - prior) / prior * 100. Null when there is nothing to compare against.
export function yoyPercent(current, prior) {
  const c = Number(current);
  const p = Number(prior);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p <= 0) return null;
  return ((c - p) / p) * 100;
}

const priceOf = (receipt) => {
  const n = parseFloat(receipt?.purchasePrice ?? receipt?.purchase_price);
  return Number.isFinite(n) ? n : 0;
};

const dayMsOf = (receipt) => {
  const unix = Number(receipt?.product_date);
  if (!Number.isFinite(unix) || unix < 1000000) return 0; // undated
  const d = new Date(unix * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const looseKey = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const isBlank = (value) => {
  const s = String(value ?? "").trim();
  return !s || s === "0" || s === "—" || s === "-";
};

// ── Dimensions ──────────────────────────────────────────────────────────────────────────
// entries(receipt) -> [{ key, name, amount }] : what the receipt belongs to, and how much
// it adds to each. An empty list means the receipt is not part of that card.

export const merchantDimension = {
  entries(r) {
    const raw = r?.storeName ?? r?.store_name;
    if (isBlank(raw)) return [];
    return [{ key: normalizeMerchantKey(raw), name: unescapeMerchantName(String(raw).trim()), amount: priceOf(r) }];
  },
};

export const categoryDimension = {
  entries(r) {
    const raw = r?.expense_type ?? r?.expenseType;
    if (isBlank(raw)) return [];
    return [{ key: looseKey(raw), name: String(raw).trim(), amount: priceOf(r) }];
  },
};

// `labelOf(receipt)` is the app's payment-method label, e.g. "Visa *4242" or "Cash".
export const paymentDimension = (labelOf) => ({
  entries(r) {
    const label = labelOf(r);
    if (isBlank(label)) return [];
    return [{ key: looseKey(label), name: String(label).trim(), amount: priceOf(r) }];
  },
});

// Tax cards add up the tax amount on each receipt line, not the receipt total. Tips are
// stored as a tax line too but are not a tax, so they never get a card.
export const taxDimension = {
  entries(r) {
    const lines = Array.isArray(r?.receipt_tax_values) ? r.receipt_tax_values : [];
    const byKey = new Map();
    lines.forEach((t) => {
      const name = String(t?.tax_name ?? "").trim();
      if (isBlank(name) || name.toLowerCase().includes("tip")) return;
      const key = looseKey(name);
      const amount = parseFloat(t?.tax_amount);
      const entry = byKey.get(key) || { key, name, amount: 0 };
      entry.amount += Number.isFinite(amount) ? amount : 0;
      byKey.set(key, entry);
    });
    return Array.from(byKey.values());
  },
};

// ── Engine ──────────────────────────────────────────────────────────────────────────────

// Everything the receipts mention for this dimension, A to Z. `name` is the spelling used
// by the most recent receipt.
export function listEntities(receipts, dimension) {
  const byKey = new Map();
  (receipts || []).forEach((r) => {
    const day = dayMsOf(r);
    dimension.entries(r).forEach(({ key, name }) => {
      const entry = byKey.get(key);
      if (!entry) byKey.set(key, { key, name, lastDay: day });
      else if (day > entry.lastDay) {
        entry.lastDay = day;
        entry.name = name;
      }
    });
  });
  return Array.from(byKey.values())
    .map(({ key, name }) => ({ key, name }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

// Number of receipts and total amount for one entity inside the range (dated receipts only).
export function totalsInRange(receipts, dimension, entityKey, range) {
  let total = 0;
  let count = 0;
  (receipts || []).forEach((r) => {
    const day = dayMsOf(r);
    if (!day || day < range.startMs || day >= range.endMs) return;
    const hits = dimension.entries(r).filter((e) => e.key === entityKey);
    if (!hits.length) return;
    hits.forEach((e) => { total += e.amount; });
    count += 1;
  });
  return { total, count };
}

// Everything a card needs for one entity, period kind and offset.
export function entityPeriodSummary(receipts, dimension, entityKey, kind, offset = 0, now = new Date()) {
  const current = periodRange(kind, offset, now);
  const prior = sameperiodLastYear(current);
  const cur = totalsInRange(receipts, dimension, entityKey, current);
  const pri = totalsInRange(receipts, dimension, entityKey, prior);
  return {
    current: { ...cur, label: current.label, detail: current.detail },
    prior: { ...pri, label: prior.label, detail: prior.detail },
    yoy: yoyPercent(cur.total, pri.total),
  };
}

// Which entity a card opens on: the first A-Z with a receipt this month, else the first.
export function defaultEntityIndex(receipts, dimension, entities, now = new Date()) {
  const month = periodRange("M", 0, now);
  const i = entities.findIndex((e) => totalsInRange(receipts, dimension, e.key, month).count > 0);
  return i === -1 ? 0 : i;
}
