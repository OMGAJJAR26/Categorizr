// ── Sort helpers ─────────────────────────────────────────────────────────────
// Standard main-screen order (same on every device, after add/edit, and after
// login). Pinned to English so the alphabetical steps do not change with the
// browser or OS locale:
//   1. Date — newest calendar day first
//   2. Total — highest first, within that day
//   3. Describe Purchase — A to Z. When that field is empty the main list
//      shows the merchant name, so the merchant name is the alphabetical key.
//   4. Merchant — A to Z, when the description label is also the same
//   5. Receipt id — newest first, only when every field above still ties
const num = (v) => (v == null ? 0 : Number(v) || 0);

// Total value of a receipt (purchasePrice is the receipt total).
const priceOf = (r) => num(r?.purchasePrice ?? r?.purchase_price);

// Compare totals in cents so 12.5 and "12.50" are the same total.
const centsOf = (r) => Math.round(priceOf(r) * 100);

// Raw product_date (unix seconds). 0 when the receipt has no date.
const dateOf = (r) => (r?.product_date ? Number(r.product_date) : 0);

// Calendar-day bucket (UTC). Receipts on the SAME day share a key so that
// Split / Duplicate receipts — which inherit the original's date — group
// together and can then be ordered by total value within that day.
const dayOf = (r) => {
  const t = dateOf(r);
  return t ? Math.floor(t / 86400) : 0;
};

const blankText = (value) => {
  const text = (value ?? "").toString().trim();
  // "0" is the API's cleared-field sentinel, not a description or merchant.
  if (!text || text === "0") return "";
  return text;
};

// Describe Purchase. Empty when the user left it blank.
const describeOf = (r) => blankText(r?.product_name ?? r?.productName);

// Merchant name shown on the main list when Describe Purchase is empty.
const merchantOf = (r) => blankText(r?.storeName ?? r?.store_name ?? r?.merchant);

const compareText = (a, b) =>
  a.localeCompare(b, "en", { sensitivity: "base" });

// Alphabetical key for step 3: the description, or the merchant when it is blank.
const describeSortLabel = (r) => describeOf(r) || merchantOf(r);

// Stable final tiebreaker. Without this, receipts that still tie keep whatever
// order the API returned them in, which can differ between sessions.
const idOf = (r) => num(r?.id ?? r?.receipt_id ?? r?.pk_receipt_id);
const byIdDesc = (a, b) => idOf(b) - idOf(a);

// Same date and same total: Describe Purchase (A–Z), then merchant (A–Z), then id.
const byDescribeThenMerchantThenId = (a, b) => {
  const describeCmp = compareText(describeSortLabel(a), describeSortLabel(b));
  if (describeCmp !== 0) return describeCmp;
  const merchantCmp = compareText(merchantOf(a), merchantOf(b));
  if (merchantCmp !== 0) return merchantCmp;
  return byIdDesc(a, b);
};

// Within a single day: largest total → smallest, then description, merchant, id.
const byTotalDescThenLabel = (a, b) => {
  const p = centsOf(b) - centsOf(a);
  if (p !== 0) return p;
  return byDescribeThenMerchantThenId(a, b);
};

// Default main-screen ordering. Exported so drafts, swipe, and other lists
// that should match the main screen use the same comparator.
export const compareByDayThenTotal = (a, b) => {
  const d = dayOf(b) - dayOf(a);
  if (d !== 0) return d;
  return byTotalDescThenLabel(a, b);
};

export const sortReceipts = (receipts, sortConfig) => {
  const sortedReceipts = [...receipts];

  if (sortConfig.amount) {
    // Explicit amount sort: total is primary. Ties follow the standard order
    // from the date step onward (newest day, then description, merchant, id).
    sortedReceipts.sort((a, b) => {
      const p =
        sortConfig.amount === "asc"
          ? centsOf(a) - centsOf(b)
          : centsOf(b) - centsOf(a);
      if (p !== 0) return p;
      const d = dayOf(b) - dayOf(a);
      if (d !== 0) return d;
      return byDescribeThenMerchantThenId(a, b);
    });
  } else if (sortConfig.date) {
    // Date sort: calendar day, then the standard within-day order.
    sortedReceipts.sort((a, b) => {
      const d =
        sortConfig.date === "newest"
          ? dayOf(b) - dayOf(a)
          : dayOf(a) - dayOf(b);
      if (d !== 0) return d;
      return byTotalDescThenLabel(a, b);
    });
  } else if (sortConfig.order) {
    // Name sort: merchant first, then newest day, then the standard within-day order.
    sortedReceipts.sort((a, b) => {
      const n =
        sortConfig.order === "az"
          ? compareText(merchantOf(a), merchantOf(b))
          : compareText(merchantOf(b), merchantOf(a));
      if (n !== 0) return n;
      const d = dayOf(b) - dayOf(a);
      if (d !== 0) return d;
      return byTotalDescThenLabel(a, b);
    });
  } else {
    // Default: newest day, highest total, Describe Purchase, merchant, id.
    sortedReceipts.sort(compareByDayThenTotal);
  }

  return sortedReceipts;
};

export const sortYears = (groupedReceipts, yearTotals, sortConfig) => {
  const NO_DATE = "No Date";
  const allKeys = Object.keys(groupedReceipts);
  // Undated receipts ("No Date") always sink to the very bottom, like the iPhone app,
  // regardless of the active sort. Sort the real years, then append "No Date".
  const hasNoDate = allKeys.includes(NO_DATE);
  const years = allKeys.filter((y) => y !== NO_DATE);

  let sorted;
  if (sortConfig.date === "newest") {
    sorted = years.sort((a, b) => b - a);
  } else if (sortConfig.date === "oldest") {
    sorted = years.sort((a, b) => a - b);
  } else if (sortConfig.amount === "asc") {
    sorted = years.sort((a, b) => yearTotals[a] - yearTotals[b]);
  } else if (sortConfig.amount === "desc") {
    sorted = years.sort((a, b) => yearTotals[b] - yearTotals[a]);
  } else if (sortConfig.order === "az") {
    sorted = years.sort((a, b) => a.localeCompare(b));
  } else if (sortConfig.order === "za") {
    sorted = years.sort((a, b) => b.localeCompare(a));
  } else {
    // Default: newest year first
    sorted = years.sort((a, b) => b - a);
  }

  return hasNoDate ? [...sorted, NO_DATE] : sorted;
};
