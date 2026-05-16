/** Shared helpers for payment method display, edit prefill, and storage. */

export const normalizePaymentMatchKey = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export const parsePaymentDisplay = (value) => {
  const raw = (value || "").toString().trim();
  if (!raw) return { issuer: "", last4: "" };

  // Use the last *#### segment as canonical last4 (handles "Other *0009 *0009" from API)
  const last4Match = raw.match(/\*(\d{3,4})\s*$/);
  const last4 = last4Match ? last4Match[1] : "";

  let issuer = raw;
  if (last4) {
    issuer = raw.replace(new RegExp(`(?:\\s*\\*${last4}\\s*)+$`, "i"), "").trim();
  }
  // Remove any remaining embedded *#### so brand/issuer is clean (e.g. "Other" not "Other *0009")
  issuer = issuer.replace(/\s*\*\d{3,4}\s*/g, " ").trim().replace(/\s+/g, " ");

  return { issuer, last4 };
};

export const inferCardTypeFromPayment = (value) => {
  const v = (value || "").toLowerCase();
  if (v.includes("visa")) return "Visa";
  if (v.includes("master")) return "MasterCard";
  if (v.includes("american") || v.includes("amex")) return "American Express";
  if (v.includes("discover")) return "Discover";
  if (v.includes("diners")) return "Diners Club";
  if (v.includes("paypal")) return "PayPal";
  if (v.includes("debit")) return "Debit Card";
  if (v.includes("cash")) return "Cash";
  return "Other";
};

export const getPaymentBrandFromMap = (paymentName, payCardMap = {}) => {
  const key = (paymentName || "").toString().trim();
  if (!key) return "";
  const fromLocal = payCardMap[key];
  if (fromLocal) return fromLocal;
  const inferred = inferCardTypeFromPayment(key);
  return inferred === "Other" ? "" : inferred;
};

/** True when issuer is a user-entered custom name (not the card brand alone). */
export const isCustomCardIssuer = (issuer, brand) => {
  const iss = (issuer || "").trim();
  if (!iss) return false;
  const ik = normalizePaymentMatchKey(iss);
  const bk = normalizePaymentMatchKey(brand || "");
  if (ik === bk) return false;
  if (ik === normalizePaymentMatchKey(inferCardTypeFromPayment(iss))) return false;
  return true;
};

/** Persist only custom issuer text; empty when user left issuer blank or it matches brand. */
export const storedCardIssuerName = (customIssuer, cardType) => {
  const iss = (customIssuer || "").trim();
  return isCustomCardIssuer(iss, cardType) ? iss : "";
};

/** List/dropdown label: brand *last4 when no custom issuer (e.g. "MasterCard *7979"). */
export const getPaymentMethodListLabel = (paymentName, brand) => {
  const { issuer, last4 } = parsePaymentDisplay(paymentName);
  const resolvedBrand = brand || inferCardTypeFromPayment(issuer || paymentName);
  const base = isCustomCardIssuer(issuer, resolvedBrand)
    ? issuer
    : (resolvedBrand || issuer || paymentName);
  if (!last4) return (base || paymentName);
  const alreadyHasLast4 =
    new RegExp(`\\*${last4}\\s*$`).test(base) || base.includes(`*${last4}`);
  return alreadyHasLast4 ? base : `${base} *${last4}`;
};

/** API/storage string: custom issuer *last4, or card type *last4 when issuer is blank. */
export const buildPaymentMethodStorageString = (customIssuer, cardType, last4) => {
  const issuer = (customIssuer || "").trim();
  const ct = (cardType || "").trim();
  const l4 = String(last4 || "").replace(/\D/g, "").slice(0, 4);
  if (!ct || l4.length < 4) return "";
  return issuer ? `${issuer} *${l4}` : `${ct} *${l4}`;
};

export const readPayCardTypeMap = () => {
  try {
    return JSON.parse(localStorage.getItem("cat_pay_card_types") || "{}");
  } catch {
    return {};
  }
};
