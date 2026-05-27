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

export const CARD_TYPE_INT_TO_BRAND = {
  0: "American Express",
  1: "MasterCard",
  2: "Visa",
  3: "Debit Card",
  4: "Discover",
  5: "Diners Club",
  6: "PayPal",
  7: "Cash",
  8: "Other",
};

/** API enum for default_payment_category: "0" = Personal, "1" = Business */
export const paymentCategoryToApiEnum = (value) => {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "1" || v === "business") return "1";
  if (v === "0" || v === "personal" || v === "") return "0";
  return "0";
};

export const paymentCategoryFromApiEnum = (value) => {
  const v = String(value ?? "").trim();
  if (v === "1") return "Business";
  if (v === "0") return "Personal";
  const lower = v.toLowerCase();
  if (lower === "business") return "Business";
  if (lower === "personal") return "Personal";
  return "";
};

export const brandToCardTypeInt = (brand) => {
  const v = (brand || "").toLowerCase();
  if (v.includes("american") || v.includes("amex")) return 0;
  if (v.includes("master")) return 1;
  if (v.includes("visa")) return 2;
  if (v.includes("debit")) return 3;
  if (v.includes("discover")) return 4;
  if (v.includes("diners")) return 5;
  if (v.includes("paypal")) return 6;
  if (v.includes("cash")) return 7;
  return 8;
};

export const cardTypeIntToBrand = (cardType) => {
  const n = parseInt(cardType, 10);
  return Number.isFinite(n) ? CARD_TYPE_INT_TO_BRAND[n] || "" : "";
};

export const getLast4FromPaymentApiRecord = (m) => {
  const cn = (m?.card_number || "").toString().trim();
  if (!cn) return "";
  const legacy = parsePaymentDisplay(cn);
  if (legacy.last4) return legacy.last4;
  const digits = cn.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : digits;
};

export const getBrandFromPaymentApiRecord = (m, payCardMap = {}) => {
  const fromInt = cardTypeIntToBrand(m?.card_type);
  if (fromInt) return fromInt;
  const cn = (m?.card_number || "").toString().trim();
  if (cn) {
    const fromMap = payCardMap[cn] || payCardMap[cn.toLowerCase()];
    if (fromMap) return fromMap;
    const inferred = inferCardTypeFromPayment(cn);
    if (inferred !== "Other") return inferred;
  }
  return inferCardTypeFromPayment(m?.card_issuer_name || "");
};

/** Display label for a GET /userpaymentmethod record (new + legacy shapes). */
export const getApiPaymentMethodDisplayName = (m, brandOverride = "") => {
  const issuerFromApi = (m?.card_issuer_name || "").toString().trim();
  const last4 = getLast4FromPaymentApiRecord(m);
  const brand = brandOverride || getBrandFromPaymentApiRecord(m);
  const cn = (m?.card_number || "").toString().trim();

  // "-" and "0" are server-side placeholder values meaning "no card number".
  // Treat them the same as empty so we fall through to brand-name display.
  const cnIsReal = cn && cn !== "-" && cn !== "0";

  if (!issuerFromApi && cnIsReal && cn.includes("*")) {
    return getPaymentMethodListLabel(cn, brand);
  }

  if (issuerFromApi) {
    const raw = last4 ? `${issuerFromApi} *${last4}` : issuerFromApi;
    return getPaymentMethodListLabel(raw, brand);
  }

  if (last4) {
    return getPaymentMethodListLabel(`${brand} *${last4}`, brand);
  }

  // Use a real card number if present; otherwise show the brand name derived
  // from card_type so e.g. {card_number:"-", card_type:"7"} → "Cash" not "-".
  return (cnIsReal ? cn : "") || brand || "";
};

export const normalizeApiPaymentMethodInput = (input, logoUrl = "", expenseType = "") => {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return {
      cardIssuerName: (input.cardIssuerName ?? input.card_issuer_name ?? "").trim(),
      cardTypeBrand: (input.cardTypeBrand ?? input.card_type_brand ?? input.cardType ?? "").trim(),
      last4: String(input.last4 ?? input.last_4_digit_card ?? "").replace(/\D/g, "").slice(0, 4),
      logoUrl: input.logoUrl ?? input.icon_image ?? logoUrl ?? "",
      expenseType: input.expenseType ?? input.default_payment_category ?? expenseType ?? "",
    };
  }
  const payStr = String(input || "").trim();
  const { issuer, last4 } = parsePaymentDisplay(payStr);
  const brand = inferCardTypeFromPayment(payStr);
  return {
    cardIssuerName: isCustomCardIssuer(issuer, brand) ? issuer : "",
    cardTypeBrand: brand,
    last4,
    logoUrl: logoUrl || "",
    expenseType: expenseType || "",
  };
};

export const buildApiPaymentMethodPayload = (
  { id = 0, fk_user_id = 0, cardIssuerName = "", cardTypeBrand = "", last4 = "", logoUrl = "", expenseType = "" },
  escape = (s) => s
) => {
  const brand = (cardTypeBrand || "").trim() || inferCardTypeFromPayment(cardIssuerName);
  const issuer = storedCardIssuerName(cardIssuerName, brand);
  const l4 = String(last4 || "").replace(/\D/g, "").slice(0, 4);
  return {
    id,
    fk_user_id,
    card_number: escape(l4),
    card_issuer_name: escape(issuer),
    icon_image: logoUrl || "",
    card_type: String(brandToCardTypeInt(brand)),
    default_payment_category: paymentCategoryToApiEnum(expenseType),
  };
};

export const paymentMethodPayloadToQuery = (payload) =>
  new URLSearchParams(
    Object.fromEntries(
      Object.entries(payload).map(([k, v]) => [k, v == null ? "" : String(v)])
    )
  ).toString();

export const apiPaymentMethodMatchesLabel = (m, label) => {
  const normalized = normalizePaymentMatchKey(label);
  if (!normalized) return false;
  if (normalizePaymentMatchKey(getApiPaymentMethodDisplayName(m)) === normalized) return true;
  return normalizePaymentMatchKey(m?.card_number) === normalized;
};

/** Canonical list label (Cash normalization for filters/dropdowns). */
export const normalizePaymentListLabel = (method) => {
  const m = (method || "").toString().trim();
  const lower = m.toLowerCase();
  if (lower === "cash" || lower.startsWith("cash *")) return "Cash";
  return m;
};

export const isValidPaymentMethodLabel = (value) => {
  const val = (value || "").toString().trim();
  if (!val || val === "0" || val === "0*0" || /^0\*\d*$/.test(val)) return false;
  if (val.length < 2) return false;
  if (/^cash\s*\*\s*0$/i.test(val)) return false;
  if (/\*\s*0$/.test(val)) return false;
  return true;
};

/** e.g. "Cash *0700" — not the canonical "Cash" row. */
export const isCashPaymentVariant = (name) => {
  const base = (name || "")
    .toString()
    .replace(/\s*\*\s*\d{3,4}\s*$/, "")
    .trim()
    .toLowerCase();
  return base === "cash" && (name || "").toString().trim().toLowerCase() !== "cash";
};

/**
 * Single merge for payment method labels — used by DataContext, Settings, Filter,
 * Add Receipt, and Edit Receipt so every surface shows the same API-backed list.
 */
export const mergePaymentMethodLabels = ({
  baseLabels = [],
  apiPaymentMethods = [],
  isHidden = () => false,
  skipMerchantCardType = true,
} = {}) => {
  const seen = new Map();
  const seenLast4 = new Set();

  const addLabel = (rawLabel) => {
    const label = normalizePaymentListLabel((rawLabel || "").toString().trim());
    if (!isValidPaymentMethodLabel(label) || label === "-") return;
    if (isCashPaymentVariant(label)) return;
    if (isHidden(label)) return;
    const key = normalizePaymentMatchKey(label);
    if (seen.has(key)) return;
    const last4 = label.match(/\*(\d{3,4})$/)?.[1];
    if (last4 && seenLast4.has(last4)) return;
    seen.set(key, label);
    if (last4) seenLast4.add(last4);
  };

  (baseLabels || []).forEach(addLabel);
  (apiPaymentMethods || []).forEach((m) => {
    if (skipMerchantCardType && String(m?.card_type || "").toLowerCase() === "merchant") {
      return;
    }
    addLabel(getApiPaymentMethodDisplayName(m));
  });

  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
};

export const getApiPaymentMethodCacheKey = (m) => {
  if (!m || typeof m !== "object") return String(m || "").trim().toLowerCase();
  const issuer = (m.card_issuer_name || m.cardIssuerName || "").trim().toLowerCase();
  const last4 = getLast4FromPaymentApiRecord(m);
  const cardType = String(m.card_type ?? "").trim();
  if (issuer || last4) return `${issuer}|${last4}|${cardType}`;
  return (m.card_number || "").trim().toLowerCase();
};
