/**
 * Receipt dates are calendar days (no time-of-day), stored as Unix seconds.
 *
 * A receipt's date IS its UTC calendar day: the day is read off the stored
 * timestamp in UTC, and a day the user picks is written back as a UTC timestamp.
 * No local-timezone reading and no guessing from create_date — every device and
 * every country shows the same day for the same receipt.
 */

/**
 * Value written when a receipt date is explicitly cleared ("No Date").
 * The backend now clears product_date when it receives 0 (verified live), so an
 * intentional clear is sent as 0 — not a tiny non-zero sentinel. Any product_date
 * below 1,000,000 is treated as undated everywhere (resolveReceiptCalendarUnix /
 * formatReceiptDate), and the fetch-time normaliser collapses it to 0.
 */
export const NO_DATE_SENTINEL_UNIX = 0;

/** Parse API unix seconds (handles ms by mistake). */
export function parseReceiptUnix(value) {
  if (value === null || value === undefined || value === "") return 0;
  let n = Number(value);
  if (!Number.isFinite(n)) {
    n = parseInt(String(value).trim(), 10) || 0;
  }
  if (n > 1e12) return Math.floor(n / 1000);
  return Math.floor(n);
}

/** UTC noon unix for Y/M/D calendar components (API writes). */
function utcNoonUnixFromParts(year, monthIndex, day) {
  return Math.floor(Date.UTC(year, monthIndex, day, 12, 0, 0) / 1000);
}

function utcCalendarDayMs(unixSeconds) {
  const ts = parseReceiptUnix(unixSeconds);
  const d = new Date(ts * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Canonical calendar date (UTC midnight unix) for display/storage.
 *
 * The stored timestamp is read in UTC, whatever its time-of-day: a receipt dated
 * 2026-09-30T00:00:00Z is September 30 for everyone. Nothing is inferred from
 * create_date or from the viewer's timezone, so the day never drifts between the
 * web app, iOS and Android, and never shifts when a receipt is re-saved.
 */
export function resolveReceiptCalendarUnix(productDateUnix) {
  const ts = parseReceiptUnix(productDateUnix);
  if (!ts || ts < 1000000) return ts;
  return Math.floor(utcCalendarDayMs(ts) / 1000);
}

/**
 * The calendar day showing on the user's own clock → UTC noon unix (for saves).
 * The day is taken locally on purpose: it is the day the user believes they are
 * entering. Storing it at UTC noon then makes that exact day the receipt's UTC
 * day, so it reads back the same here and on mobile.
 */
export function localCalendarDateToUnix(date = new Date()) {
  return utcNoonUnixFromParts(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
}

export function parseDateInputToUnix(dateString) {
  if (!dateString || typeof dateString !== "string") return 0;
  const [yr, mo, dy] = dateString.split("-").map(Number);
  if (!yr || !mo || !dy) return 0;
  return utcNoonUnixFromParts(yr, mo - 1, dy);
}

export function todayLocalCalendarUnix() {
  return localCalendarDateToUnix(new Date());
}

/**
 * Encode the sender's calendar day for API writes (forward, mobile sync).
 * Uses UTC noon so iOS/Android show the same date regardless of device timezone.
 */
export function productDateUnixToApiUnix(productDateUnix) {
  const ts = parseReceiptUnix(productDateUnix);
  if (!ts || ts < 1000000) return ts;
  const d = new Date(ts * 1000);
  return utcNoonUnixFromParts(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
  );
}

/** Re-anchor a stored date to UTC noon of its own UTC day, for API writes. */
export function calendarUnixToMobileUnix(productDateUnix) {
  return productDateUnixToApiUnix(resolveReceiptCalendarUnix(productDateUnix));
}

const RECEIPT_DATE_FORMAT = {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
};

const RECEIPT_DATE_LONG_FORMAT = {
  timeZone: "UTC",
  month: "long",
  day: "numeric",
  year: "numeric",
};

const isDateFormatOptions = (value) =>
  !!value &&
  typeof value === "object" &&
  !Number.isFinite(Number(value)) &&
  ("month" in value || "timeZone" in value);

/**
 * Format for UI, always in UTC. Accepts a receipt object or a product_date; the
 * create_date argument some callers still pass is ignored (the day comes from
 * product_date alone). Format options may be passed in place of it or after it.
 */
export function formatReceiptDate(productDate, createDateOrOptions = 0, options) {
  if (
    productDate &&
    typeof productDate === "object" &&
    !Number.isFinite(Number(productDate))
  ) {
    return formatReceiptDate(productDate.product_date, createDateOrOptions, options);
  }

  let fmt = RECEIPT_DATE_FORMAT;
  if (isDateFormatOptions(createDateOrOptions)) {
    fmt = createDateOrOptions;
  } else if (isDateFormatOptions(options)) {
    fmt = options;
  }

  const ts = Number(resolveReceiptCalendarUnix(productDate));
  if (!ts || ts < 1000000) return "—";
  const date = new Date(ts * 1000);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", fmt);
}

export function formatReceiptDateLong(productDate, createDate = 0) {
  return formatReceiptDate(productDate, createDate, RECEIPT_DATE_LONG_FORMAT);
}

/**
 * The UTC calendar day a receipt falls on, as ms — the day the UI shows it under.
 * 0 when the receipt is undated.
 */
export function receiptCalendarDayMs(productDate) {
  const ts = Number(resolveReceiptCalendarUnix(productDate));
  if (!ts || ts < 1000000) return 0;
  return ts * 1000;
}

/**
 * The calendar day a date-picker value stands for, as ms, ready to compare against
 * a receipt's UTC day. A picker gives a day rather than an instant, so a
 * "YYYY-MM-DD" string is taken at face value and a Date is read on the local clock
 * the user picked it on.
 */
export function pickedCalendarDayMs(value) {
  if (typeof value === "string") {
    const [yr, mo, dy] = value.split("-").map(Number);
    if (yr && mo && dy) return Date.UTC(yr, mo - 1, dy);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return NaN;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function productDateToInputValue(productDate) {
  const ts = Number(resolveReceiptCalendarUnix(productDate));
  if (!ts || ts < 1000000) return "";
  const d = new Date(ts * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
