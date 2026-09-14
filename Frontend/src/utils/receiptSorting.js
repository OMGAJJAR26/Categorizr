// ── Sort helpers ─────────────────────────────────────────────────────────────
const num = (v) => (v == null ? 0 : Number(v) || 0);

// Total value of a receipt (purchasePrice is the receipt total).
const priceOf = (r) => num(r?.purchasePrice);

// Raw product_date (unix seconds). 0 when the receipt has no date.
const dateOf = (r) => (r?.product_date ? Number(r.product_date) : 0);

// Calendar-day bucket (UTC). Receipts on the SAME day share a key so that
// Split / Duplicate receipts — which inherit the original's date — group
// together and can then be ordered by total value within that day.
const dayOf = (r) => {
  const t = dateOf(r);
  return t ? Math.floor(t / 86400) : 0;
};

// Stable final tiebreaker. Without this, receipts that tie on date AND total
// (common for Split/Duplicate) keep whatever order the API returned them in,
// which can differ between sessions — so the list appears to "reshuffle" after
// a logout/login. Ordering by receipt id (newest first) makes the order
// deterministic and identical every time the same data loads.
const idOf = (r) => num(r?.id ?? r?.receipt_id ?? r?.pk_receipt_id);
const byIdDesc = (a, b) => idOf(b) - idOf(a);

// Within a single day, always order by largest total → smallest, then by id.
const byTotalDescThenId = (a, b) => {
  const p = priceOf(b) - priceOf(a);
  if (p !== 0) return p;
  return byIdDesc(a, b);
};

// Default main-screen ordering: newest day first, then largest total → smallest
// for that day, then a stable id tiebreaker. Exported so other sections (e.g. the
// draft "To Be Verified" list) order Split/Duplicate receipts identically.
export const compareByDayThenTotal = (a, b) => {
  const d = dayOf(b) - dayOf(a);
  if (d !== 0) return d;
  return byTotalDescThenId(a, b);
};

export const sortReceipts = (receipts, sortConfig) => {
  const sortedReceipts = [...receipts];

  if (sortConfig.amount) {
    // Explicit amount sort: total value is primary; break ties by day then id.
    sortedReceipts.sort((a, b) => {
      const p =
        sortConfig.amount === "asc"
          ? priceOf(a) - priceOf(b)
          : priceOf(b) - priceOf(a);
      if (p !== 0) return p;
      const d = dayOf(b) - dayOf(a);
      if (d !== 0) return d;
      return byIdDesc(a, b);
    });
  } else if (sortConfig.date) {
    // Date sort: order by calendar day, then largest total → smallest for that
    // day, then a stable id tiebreaker (persists across logout/login).
    sortedReceipts.sort((a, b) => {
      const d =
        sortConfig.date === "newest"
          ? dayOf(b) - dayOf(a)
          : dayOf(a) - dayOf(b);
      if (d !== 0) return d;
      return byTotalDescThenId(a, b);
    });
  } else if (sortConfig.order) {
    // Name sort: order by merchant, then day (newest), then total, then id.
    sortedReceipts.sort((a, b) => {
      const nameA = a.storeName?.toLowerCase() || "";
      const nameB = b.storeName?.toLowerCase() || "";
      const n =
        sortConfig.order === "az"
          ? nameA.localeCompare(nameB)
          : nameB.localeCompare(nameA);
      if (n !== 0) return n;
      const d = dayOf(b) - dayOf(a);
      if (d !== 0) return d;
      return byTotalDescThenId(a, b);
    });
  } else {
    // Default: newest day first, then largest total → smallest, then id.
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
