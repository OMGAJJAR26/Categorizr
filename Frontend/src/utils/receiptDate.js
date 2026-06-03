/**
 * Receipt dates are calendar days (no time-of-day).
 * Stored as Unix seconds; mobile may send UTC midnight or Date.now().
 * resolveReceiptCalendarUnix() picks the calendar day the user entered so
 * the same date shows in every country.
 */

const ONE_DAY_MS = 86400000;

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

/** True when timestamp is exactly 00:00:00 UTC. */
function isUtcDateOnlyUnix(unixSeconds) {
  const ts = parseReceiptUnix(unixSeconds);
  return ts > 0 && ts % 86400 === 0;
}

function utcCalendarDayMs(unixSeconds) {
  const ts = parseReceiptUnix(unixSeconds);
  const d = new Date(ts * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function localCalendarDayMs(unixSeconds) {
  const ts = parseReceiptUnix(unixSeconds);
  const d = new Date(ts * 1000);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function receiptIsDraft(hints = {}) {
  if (hints.isDraft === true) return true;
  const emailId = hints.fk_incoming_email_id;
  return (
    emailId != null &&
    emailId !== "" &&
    emailId !== "0" &&
    emailId !== 0
  );
}

/**
 * Canonical calendar date (UTC midnight unix) for display/storage.
 * Uses UTC + create_date rules so the entered day is stable across countries.
 */
export function resolveReceiptCalendarUnix(
  productDateUnix,
  createDateUnix = 0,
  hints = {},
) {
  const ts = parseReceiptUnix(productDateUnix);
  if (!ts || ts < 1000000) return ts;

  const createTs = parseReceiptUnix(createDateUnix);
  const utcDay = utcCalendarDayMs(ts);
  const localDay = localCalendarDayMs(ts);

  // --- Timestamps with a time component (e.g. mobile Date.now()) ---
  if (!isUtcDateOnlyUnix(ts)) {
    const createUtcDay =
      createTs >= 1000000 ? utcCalendarDayMs(createTs) : 0;

    // Created same UTC day but product instant is "evening before" in Americas:
    // e.g. product 03:31 UTC June 3, create same → treat as June 2
    if (
      createUtcDay &&
      utcDay === createUtcDay &&
      new Date(ts * 1000).getUTCHours() < 12
    ) {
      return Math.floor((utcDay - ONE_DAY_MS) / 1000);
    }

    if (utcDay !== localDay) {
      if (utcDay - localDay === ONE_DAY_MS) return Math.floor(localDay / 1000);
      if (localDay - utcDay === ONE_DAY_MS) return Math.floor(utcDay / 1000);
    }
    return Math.floor(utcDay / 1000);
  }

  // --- UTC midnight (web date picker or mobile UTC-midnight bug) ---
  if (createTs >= 1000000) {
    const createUtcDay = utcCalendarDayMs(createTs);
    const createLocalDay = localCalendarDayMs(createTs);

    // Product UTC date is exactly one day after create's local calendar day
    if (utcDay - createLocalDay === ONE_DAY_MS) {
      return Math.floor(createLocalDay / 1000);
    }

    // Product one UTC day ahead of when the row was created
    if (utcDay - createUtcDay === ONE_DAY_MS) {
      return Math.floor(createUtcDay / 1000);
    }

    // Same UTC day: create in early UTC morning → purchase was prior calendar day
    if (
      utcDay === createUtcDay &&
      !isUtcDateOnlyUnix(createTs) &&
      new Date(createTs * 1000).getUTCHours() < 12
    ) {
      return Math.floor((utcDay - ONE_DAY_MS) / 1000);
    }
  }

  // Draft / eReceipt with no create_date: mobile often stores UTC midnight +1 day
  if (
    createTs < 1000000 &&
    isUtcDateOnlyUnix(ts) &&
    receiptIsDraft(hints)
  ) {
    if (utcDay - localDay === ONE_DAY_MS) {
      return Math.floor(localDay / 1000);
    }
    return Math.floor((utcDay - ONE_DAY_MS) / 1000);
  }

  return Math.floor(utcDay / 1000);
}

function hintsFromReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") return {};
  return {
    isDraft: receipt.is_draft === "1" || receipt.is_draft === 1,
    fk_incoming_email_id: receipt.fk_incoming_email_id,
  };
}

/** Local calendar today → UTC midnight unix (for saves). */
export function localCalendarDateToUnix(date = new Date()) {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 1000,
  );
}

export function parseDateInputToUnix(dateString) {
  if (!dateString || typeof dateString !== "string") return 0;
  const [yr, mo, dy] = dateString.split("-").map(Number);
  if (!yr || !mo || !dy) return 0;
  const d = new Date(Date.UTC(yr, mo - 1, dy));
  if (isNaN(d.getTime())) return 0;
  return Math.floor(d.getTime() / 1000);
}

export function todayLocalCalendarUnix() {
  return localCalendarDateToUnix(new Date());
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

/**
 * Format for UI. Pass create_date when available (second arg or receipt object).
 */
export function formatReceiptDate(
  productDate,
  createDateOrOptions = 0,
  options,
  receiptHints,
) {
  let createDate = 0;
  let fmt = RECEIPT_DATE_FORMAT;
  let hints = receiptHints || {};

  if (
    productDate &&
    typeof productDate === "object" &&
    !Number.isFinite(Number(productDate))
  ) {
    const receipt = productDate;
    hints = hintsFromReceipt(receipt);
    return formatReceiptDate(
      receipt.product_date,
      receipt.create_date ?? receipt.createDate,
      createDateOrOptions,
      hints,
    );
  }

  if (
    createDateOrOptions &&
    typeof createDateOrOptions === "object" &&
    !Number.isFinite(Number(createDateOrOptions)) &&
    ("month" in createDateOrOptions || "timeZone" in createDateOrOptions)
  ) {
    fmt = createDateOrOptions;
  } else {
    createDate = createDateOrOptions;
    if (options && typeof options === "object" && "isDraft" in options) {
      hints = options;
    } else if (options) {
      fmt = options;
    }
  }

  const resolved = resolveReceiptCalendarUnix(productDate, createDate, hints);
  const ts = Number(resolved);
  if (!ts || ts < 1000000) return "—";
  const date = new Date(ts * 1000);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", fmt);
}

export function formatReceiptDateLong(productDate, createDate = 0) {
  if (productDate && typeof productDate === "object") {
    return formatReceiptDate(productDate, RECEIPT_DATE_LONG_FORMAT);
  }
  return formatReceiptDate(productDate, createDate, RECEIPT_DATE_LONG_FORMAT);
}

export function productDateToInputValue(productDate, createDate = 0, hints = {}) {
  const resolved = resolveReceiptCalendarUnix(productDate, createDate, hints);
  const ts = Number(resolved);
  if (!ts || ts < 1000000) return "";
  const d = new Date(ts * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
