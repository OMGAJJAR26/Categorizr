import { useCallback, useMemo } from "react";
import Visa from "../assets/payment/Visa.png";
import MasterCard from "../assets/payment/MasterCard.png";
import PayPal from "../assets/payment/PayPal.png";
import AmericanExpress from "../assets/payment/AmericanExpress.webp";
import Discover from "../assets/payment/discover.png";
import DinersClub from "../assets/payment/DinersClub.png";
import Cash from "../assets/payment/Cash.jpg";
import DebitCard from "../assets/payment/DebitCard.webp";
import Creditdebitcardicon from "../assets/payment/Creditdebitcardicon.jpg";

const isValidUrl = (u) => {
  if (!u || typeof u !== "string") return false;
  const s = u.trim();
  return /^https?:\/\//i.test(s) || s.startsWith("data:image");
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

export const usePaymentDisplay = () => {
  // getPaymentLogo accepts either a string (paymentType) or a receipt object.
  // Always returns a logo — never undefined/null.
  const getPaymentLogo = useCallback((paymentTypeOrReceipt) => {
    if (!paymentTypeOrReceipt) return LOGO_MAP.other;

    const isObject = typeof paymentTypeOrReceipt === "object";

    // Step 1: Explicit logo URL from receipt object
    if (isObject) {
      const explicitLogo =
        paymentTypeOrReceipt.payment_logo_url ||
        paymentTypeOrReceipt.paymentLogoUrl ||
        paymentTypeOrReceipt.payment_logo ||
        paymentTypeOrReceipt.paymentLogo ||
        paymentTypeOrReceipt.payment_display?.logoUrl ||
        paymentTypeOrReceipt.paymentDisplay?.logoUrl;
      if (isValidUrl(explicitLogo)) return explicitLogo.trim();
    }

    // Step 2: Extract payment fields
    let paymentType = "";
    let paymentBrand = "";
    let cardIssuerName = "";

    if (isObject) {
      paymentType = (paymentTypeOrReceipt.paymentType || paymentTypeOrReceipt.payment_type || "").toString().trim();
      paymentBrand = (paymentTypeOrReceipt.paymentBrand || paymentTypeOrReceipt.payment_method_name || "").toString().trim();
      const selectedCardType = (paymentTypeOrReceipt.selectedCardType || paymentTypeOrReceipt.selected_card_type || "").toString().trim();
      cardIssuerName = (selectedCardType || paymentTypeOrReceipt.card_issuer_name || paymentTypeOrReceipt.cardIssuerName || "").toString().trim();
    } else {
      paymentType = paymentTypeOrReceipt.toString().trim();
    }

    // Helper: get network logo from a string (strips *last4 first)
    const networkFromStr = (s) => {
      if (!s || s === "0") return null;
      const base = s.replace(/\s*\*\d{3,4}$/, "").trim();
      if (!base || base === "0") return null;
      const network = detectCardNetwork(base);
      return network ? LOGO_MAP[network] : null;
    };

    // Priority 1: paymentType network detection
    const logo1 = networkFromStr(paymentType);
    if (logo1) return logo1;

    // Priority 2: paymentBrand network detection
    const logo2 = networkFromStr(paymentBrand);
    if (logo2) return logo2;

    // Priority 3: card_issuer_name network detection (skip generic values)
    if (cardIssuerName && cardIssuerName !== "0") {
      const issuerLower = cardIssuerName.toLowerCase().trim();
      const isGeneric = issuerLower === "personal" || issuerLower === "business";
      if (!isGeneric) {
        const logo3 = networkFromStr(cardIssuerName);
        if (logo3) return logo3;
      }
      if (issuerLower === "other") return LOGO_MAP.other;
    }

    // Priority 4: "Other", gift cards, special types → credit card icon
    const allSources = [paymentType, cardIssuerName, paymentBrand];
    for (const src of allSources) {
      if (!src || src === "0") continue;
      const base = src.replace(/\s*\*\d{3,4}$/, "").toLowerCase().trim();
      if (base === "other" || base.includes("starbucks") || base.includes("gift")) {
        return LOGO_MAP.other;
      }
    }

    // Priority 5: Bank name detection → MasterCard logo (like mobile app)
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

    // Priority 6: Anything with *XXXX pattern → bank logo
    for (const src of allSources) {
      if (src && /\*\d{3,4}$/.test(src.trim())) return LOGO_MAP.bank;
    }

    // Default
    return LOGO_MAP.other;
  }, []);

  // Match PaymentFilterMethod.jsx logic for consistency
  // Display format: cardIssuerName *last4 (ALWAYS prioritize cardIssuerName over paymentType)
  const getPaymentDisplay = useCallback((receipt) => {
    // PRIORITY 1: Always use cardIssuerName if available (this is what user wants to see)
    // Handle both snake_case and camelCase formats from API
    const issuer = (
      receipt?.card_issuer_name || 
      receipt?.cardIssuerName ||
      ""
    )?.toString?.().trim?.() || null;
    const type = receipt?.paymentType?.toString?.().trim?.() || null;

    // Handle completely empty case
    if (!issuer && !type) return "-";

    // Handle cash
    if (type?.toLowerCase().includes("cash")) return "Cash";
    if (issuer?.toLowerCase() === "cash") return "Cash";

    // Extract last4 from last_4_digit_card field (API stores it separately) - PRIORITY
    // Handle both snake_case and camelCase formats
    let last4 = "";
    const last4Raw = (
      receipt?.last_4_digit_card || 
      receipt?.last4DigitCard ||
      ""
    )?.toString?.().trim?.() || "";
    if (last4Raw && last4Raw !== "0" && /^\d{3,4}$/.test(last4Raw)) {
      last4 = last4Raw;
    }

    // Also check paymentType if last4 not found in last_4_digit_card field
    if (!last4 && type && type.includes("*")) {
      const parts = type.split("*");
      const tail = parts[parts.length - 1];
      const digits = tail?.replace(/\D/g, "") || "";
      if (digits.length >= 3) {
        last4 = digits.slice(-4);
      }
    }

    // PRIORITY 1: If cardIssuerName exists, ALWAYS use it (this is what user wants)
    if (issuer && issuer !== "0" && issuer.trim() !== "") {
      // Guard: iOS may store "Mastercard *7836" in issuer AND "7836" in last_4_digit_card.
      // Only append *last4 if the issuer doesn't already contain it.
      const alreadyHasLast4 = last4 && issuer.includes(`*${last4}`);
      return `${issuer}${last4 && !alreadyHasLast4 ? ` *${last4}` : ""}`;
    }

    // PRIORITY 2: Only if cardIssuerName is missing, try to extract from paymentType
    // But user wants cardIssuerName, so we should try to get it from paymentType and use it
    if ((!issuer || issuer === "0") && type && type !== "0" && type !== "0*0" && !/^0\*\d*$/.test(type)) {
      const baseType = type.replace(/\s*\*\d{3,4}$/, "").trim();
      const typeLower = baseType.toLowerCase();
      
      // Extract card network name from paymentType to use as cardIssuerName
      let extractedIssuer = null;
      if (typeLower.includes("visa")) extractedIssuer = "Visa";
      else if (typeLower.includes("master")) extractedIssuer = "MasterCard";
      else if (typeLower.includes("amex") || typeLower.includes("american express")) extractedIssuer = "American Express";
      else if (typeLower.includes("discover")) extractedIssuer = "Discover";
      else if (typeLower.includes("diners")) extractedIssuer = "Diners Club";
      else if (typeLower.includes("paypal")) extractedIssuer = "PayPal";
      else if (typeLower.includes("debit")) extractedIssuer = "Debit Card";
      else if (baseType && baseType !== "0") {
        extractedIssuer = baseType;
      }

      // Use extracted issuer as cardIssuerName
      if (extractedIssuer) {
        return `${extractedIssuer}${last4 ? ` *${last4}` : ""}`;
      }
    }

    // Last resort: show last4 if available
    if (last4) {
      return `*${last4}`;
    }

    return "-";
  }, []);

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
        // Guard: don't append *last4 if finalName already contains it
        const alreadyHasLast4a = finalName.includes(`*${last4DigitCard}`);
        return alreadyHasLast4a ? finalName : `${finalName} *${last4DigitCard}`;
      } else {
        // basePaymentType already has *digits stripped; cardIssuerName may still contain it
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
      // Guard: iOS may embed *last4 in cardIssuerName already
      const alreadyHasLast4b = cardIssuerName.includes(`*${last4DigitCard}`);
      return alreadyHasLast4b ? cardIssuerName : `${cardIssuerName} *${last4DigitCard}`;
    }

    return "—";
  }, []);

  // Optional: A combined function that extracts issuer from payment method string
  const getPaymentDisplayFromMethod = useCallback((method, receiptData = {}) => {
    if (!method) return "—";
    
    // Try to extract issuer from method string
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
    
    // Use the detailed display with extracted or provided data
    const paymentData = {
      paymentType: method,
      card_issuer_name: receiptData.card_issuer_name || issuer,
      last_4_digit_card: receiptData.last_4_digit_card || ""
    };
    
    return getDetailedPaymentDisplay(paymentData);
  }, [getDetailedPaymentDisplay]);

  return {
    getPaymentLogo,
    getPaymentDisplay, // Simple version
    getDetailedPaymentDisplay, // Your detailed logic
    getPaymentDisplayFromMethod, // For when you only have method string
    LOGO_MAP,
  };
};