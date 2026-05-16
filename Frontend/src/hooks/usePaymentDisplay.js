import { useCallback } from "react";
import {
  inferCardTypeFromPayment,
  isCustomCardIssuer,
  parsePaymentDisplay,
} from "../utils/paymentMethodUtils";
const Visa              = "/payment-logos/Visa.png";
const MasterCard        = "/payment-logos/MasterCard.png";
const PayPal            = "/payment-logos/PayPal.png";
const AmericanExpress   = "/payment-logos/AmericanExpress.webp";
const Discover          = "/payment-logos/discover.png";
const DinersClub        = "/payment-logos/DinersClub.png";
const Cash              = "/payment-logos/Cash.jpg";
const DebitCard         = "/payment-logos/DebitCard.webp";
const Creditdebitcardicon = "/payment-logos/Creditdebitcardicon.jpg";

const isValidUrl = (u) => {
  if (!u || typeof u !== "string") return false;
  const s = u.trim();
  // Accept absolute URLs, data URIs, and stable /payment-logos/ public-folder paths
  return /^https?:\/\//i.test(s) || s.startsWith("data:image") || s.startsWith("/payment-logos/");
};

const LOGO_MAP = {
  visa: Visa,
  mastercard: MasterCard,
  paypal: PayPal,
  americanexpress: AmericanExpress,
  discover: Discover,
  dinersclub: DinersClub,
  cash: Cash,
  debitcard: DebitCard,
  creditcard: Creditdebitcardicon,
  bank: MasterCard, // Use MasterCard logo as default for bank cards (like mobile app)
  other: Creditdebitcardicon, // Use credit card icon for Starbucks, gift cards, and other
};

// Helper function to detect card network from a string
const detectCardNetwork = (str) => {
  if (!str) return null;
  const normalized = str.toLowerCase().replace(/\s+/g, "");

  if (normalized.includes("visa")) return "visa";
  if (normalized.includes("master")) return "mastercard";
  if (normalized.includes("paypal")) return "paypal";
  if (normalized.includes("americanexpress") || normalized.includes("amex")) return "americanexpress";
  if (normalized.includes("discover")) return "discover";
  if (normalized.includes("diners")) return "dinersclub";
  if (normalized.includes("cash")) return "cash";
  if (normalized.includes("debit")) return "debitcard";
  if (normalized.includes("credit")) return "creditcard";

  return null;
};

// Match PaymentFilterMethod.jsx logic for consistency
// Display format: cardIssuerName *last4 (ALWAYS prioritize cardIssuerName over paymentType)
export function getPaymentDisplayFromReceipt(receipt) {
  const issuer = (
    receipt?.card_issuer_name ||
    receipt?.cardIssuerName ||
    ""
  )
    ?.toString?.()
    .trim?.() || "";
  const type = (receipt?.paymentType || receipt?.payment_type || "")
    ?.toString?.()
    .trim?.() || "";
  const selectedType = (
    receipt?.selected_card_type ||
    receipt?.selectedCardType ||
    ""
  )
    ?.toString?.()
    .trim?.() || "";

  if (!issuer && !type && !selectedType) return "-";

  const cashHint = `${issuer} ${type} ${selectedType}`.toLowerCase();
  if (cashHint.includes("cash")) return "Cash";

  let last4 = "";
  const last4Raw = (
    receipt?.last_4_digit_card ||
    receipt?.last4DigitCard ||
    ""
  )
    ?.toString?.()
    .trim?.() || "";
  if (last4Raw && last4Raw !== "0" && /^\d{3,4}$/.test(last4Raw)) {
    last4 = last4Raw;
  } else if (type.includes("*")) {
    last4 = parsePaymentDisplay(type).last4;
  }

  const typeBase = (type || selectedType).replace(/\s*\*\d{3,4}$/, "").trim();
  const brand =
    typeBase ||
    inferCardTypeFromPayment(issuer || type || selectedType);

  if (issuer && issuer !== "0") {
    const cleanIssuer = issuer.replace(/\s*\*\d{3,4}/g, "").trim();
    const displayBase = isCustomCardIssuer(cleanIssuer, brand)
      ? cleanIssuer
      : brand || cleanIssuer;
    const alreadyHasLast4 = last4 && issuer.includes(`*${last4}`);
    return `${displayBase}${last4 && !alreadyHasLast4 ? ` *${last4}` : ""}`;
  }

  if (brand && brand !== "0" && !/^0\*\d*$/.test(brand)) {
    return `${brand}${last4 ? ` *${last4}` : ""}`;
  }

  if (last4) return `*${last4}`;
  return "-";
}

/** Card type is "Other" — always use the generic credit-card icon until user picks another type. */
const isOtherCardType = (paymentType) => {
  const baseType = (paymentType || "").replace(/\s*\*\d{3,4}$/, "").trim().toLowerCase();
  return baseType === "other";
};

export const usePaymentDisplay = () => {
  const getPaymentLogo = useCallback((paymentTypeOrReceipt) => {
    if (!paymentTypeOrReceipt) return null;

    const isObject = typeof paymentTypeOrReceipt === "object";

    let paymentType = "";
    let paymentBrand = "";
    let cardIssuerName = "";
    let selectedCardType = "";

    if (isObject) {
      paymentType = (paymentTypeOrReceipt.paymentType || paymentTypeOrReceipt.payment_type || "").toString().trim();
      paymentBrand = (paymentTypeOrReceipt.paymentBrand || paymentTypeOrReceipt.payment_method_name || "").toString().trim();
      selectedCardType = (paymentTypeOrReceipt.selectedCardType || paymentTypeOrReceipt.selected_card_type || "").toString().trim();
      cardIssuerName = (paymentTypeOrReceipt.card_issuer_name || paymentTypeOrReceipt.cardIssuerName || "").toString().trim();
      // Local payment-method objects store brand in selectedCardType; use only when paymentType is empty.
      if (!paymentType && selectedCardType && !cardIssuerName) {
        paymentType = selectedCardType;
      }
    } else {
      paymentType = paymentTypeOrReceipt.toString().trim();
    }

    // Card type "Other" → always generic credit-card icon (ignore stale cached logos)
    if (isOtherCardType(paymentType)) {
      return LOGO_MAP.other;
    }

    if (isObject) {
      const explicitLogo =
        paymentTypeOrReceipt.payment_logo_url ||
        paymentTypeOrReceipt.paymentLogoUrl ||
        paymentTypeOrReceipt.payment_logo ||
        paymentTypeOrReceipt.paymentLogo ||
        paymentTypeOrReceipt.payment_display?.logoUrl ||
        paymentTypeOrReceipt.paymentDisplay?.logoUrl;
      if (isValidUrl(explicitLogo) && !isOtherCardType(paymentType)) {
        return explicitLogo.trim();
      }
    }

    const networkFromStr = (s) => {
      if (!s || s === "0") return null;
      const base = s.replace(/\s*\*\d{3,4}$/, "").trim();
      if (!base || base === "0") return null;
      const network = detectCardNetwork(base);
      return network ? LOGO_MAP[network] : null;
    };

    const logo1 = networkFromStr(paymentType);
    if (logo1) return logo1;

    const logo2 = networkFromStr(paymentBrand);
    if (logo2) return logo2;

    if (cardIssuerName && cardIssuerName !== "0") {
      const issuerLower = cardIssuerName.toLowerCase().trim();
      const isGeneric = issuerLower === "personal" || issuerLower === "business";
      if (!isGeneric) {
        const logo3 = networkFromStr(cardIssuerName);
        if (logo3) return logo3;
      }
      if (issuerLower === "other") return LOGO_MAP.other;
    }

    const allSources = [paymentType, cardIssuerName, paymentBrand];
    for (const src of allSources) {
      if (!src || src === "0") continue;
      const base = src.replace(/\s*\*\d{3,4}$/, "").toLowerCase().trim();
      if (base === "other") return LOGO_MAP.other;
      if (base.includes("starbucks") || base.includes("gift")) {
        return LOGO_MAP.other;
      }
    }

    const bankNames = [
      "bank of america", "bank one", "chase", "wells fargo", "citibank", "citi",
      "capital one", "us bank", "pnc", "td bank", "truist", "regions", "ally",
      "synchrony", "barclays", "hsbc", "citizens", "bmo", "santander",
      "hdfc", "icici", "sbi", "axis", "kotak", "pnb", "canara",
      "union bank", "indian bank",
    ];
    for (const src of allSources) {
      if (!src || src === "0") continue;
      const base = src.replace(/\s*\*\d{3,4}$/, "").toLowerCase().trim();
      if (bankNames.some((b) => base.includes(b)) || /^bm[\s*]/.test(base)) {
        return LOGO_MAP.bank;
      }
    }

    for (const src of allSources) {
      if (src && /\*\d{3,4}$/.test(src.trim())) return LOGO_MAP.bank;
    }

    return LOGO_MAP.other;
  }, []);

  const getPaymentDisplay = useCallback(getPaymentDisplayFromReceipt, []);

  const getDetailedPaymentDisplay = useCallback((receipt) => {
    const paymentType = receipt?.paymentType;
    const cardIssuerName = receipt?.card_issuer_name;
    const last4DigitCard = receipt?.last_4_digit_card;

    if (!paymentType && !cardIssuerName) return "—";

    if (paymentType && cardIssuerName && last4DigitCard) {
      const basePaymentType = paymentType.replace(/\s*\*\d+$/, "").trim();

      const normalizedBase = basePaymentType.toLowerCase();
      const normalizedIssuer = cardIssuerName.toLowerCase();

      if (
        normalizedBase.includes(normalizedIssuer) ||
        normalizedIssuer.includes(normalizedBase)
      ) {
        const finalName =
          basePaymentType.length > cardIssuerName.length
            ? basePaymentType
            : cardIssuerName;
        const alreadyHasLast4a = finalName.includes(`*${last4DigitCard}`);
        return alreadyHasLast4a ? finalName : `${finalName} *${last4DigitCard}`;
      } else {
        const cleanIssuer = cardIssuerName.replace(/\s*\*\d+$/, "").trim();
        return `${basePaymentType} ${cleanIssuer} *${last4DigitCard}`;
      }
    }

    if (paymentType && last4DigitCard) {
      const basePaymentType = paymentType.replace(/\s*\*\d+$/, "").trim();
      return `${basePaymentType} *${last4DigitCard}`;
    }

    if (paymentType) {
      return paymentType;
    }

    if (cardIssuerName && last4DigitCard) {
      const alreadyHasLast4b = cardIssuerName.includes(`*${last4DigitCard}`);
      return alreadyHasLast4b ? cardIssuerName : `${cardIssuerName} *${last4DigitCard}`;
    }

    return "—";
  }, []);

  const getPaymentDisplayFromMethod = useCallback((method, receiptData = {}) => {
    if (!method) return "—";

    const methodLower = method.toLowerCase();
    let issuer = null;

    if (methodLower.includes("visa")) issuer = "Visa";
    else if (methodLower.includes("master")) issuer = "MasterCard";
    else if (methodLower.includes("amex") || methodLower.includes("american express"))
      issuer = "American Express";
    else if (methodLower.includes("discover")) issuer = "Discover";
    else if (methodLower.includes("diners")) issuer = "Diners Club";
    else if (methodLower.includes("paypal")) issuer = "PayPal";
    else if (methodLower.includes("debit")) issuer = "Debit Card";
    else if (methodLower.includes("cash")) issuer = "Cash";
    else issuer = method;

    const paymentData = {
      paymentType: method,
      card_issuer_name: receiptData.card_issuer_name || issuer,
      last_4_digit_card: receiptData.last_4_digit_card || ""
    };

    return getDetailedPaymentDisplay(paymentData);
  }, [getDetailedPaymentDisplay]);

  return {
    getPaymentLogo,
    getPaymentDisplay,
    getDetailedPaymentDisplay,
    getPaymentDisplayFromMethod,
    LOGO_MAP,
  };
};
