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
  // getPaymentLogo can accept either a string (paymentType) or a receipt object
  const getPaymentLogo = useCallback((paymentTypeOrReceipt) => {
    // Always return a default logo if input is invalid
    if (!paymentTypeOrReceipt) return LOGO_MAP.other;

    // Check if it's a receipt object (has paymentType or paymentBrand property)
    const isReceiptObject = typeof paymentTypeOrReceipt === "object";

    // If API already provides a logo URL, use it first
    if (isReceiptObject) {
      const explicitLogo =
        paymentTypeOrReceipt.payment_logo_url ||
        paymentTypeOrReceipt.paymentLogoUrl ||
        paymentTypeOrReceipt.payment_logo ||
        paymentTypeOrReceipt.paymentLogo ||
        paymentTypeOrReceipt.payment_display?.logoUrl ||
        paymentTypeOrReceipt.paymentDisplay?.logoUrl;

      if (isValidUrl(explicitLogo)) {
        return explicitLogo.trim();
      }
    }

    let paymentType = "";
    let paymentBrand = "";
    let cardIssuerName = "";
    let selectedCardType = "";

    if (isReceiptObject) {
      // It's a receipt object - extract all payment-related fields
      // Handle both snake_case and camelCase formats from API
      paymentBrand = (paymentTypeOrReceipt.paymentBrand || paymentTypeOrReceipt.payment_method_name || "").toString().trim();
      paymentType = (paymentTypeOrReceipt.paymentType || paymentTypeOrReceipt.payment_type || "").toString().trim();
      selectedCardType = (
        paymentTypeOrReceipt.selectedCardType ||
        paymentTypeOrReceipt.selected_card_type ||
        ""
      ).toString().trim();
      cardIssuerName = (
        selectedCardType ||
        paymentTypeOrReceipt.card_issuer_name ||
        paymentTypeOrReceipt.cardIssuerName ||
        ""
      ).toString().trim();
      
      // IMPORTANT: If paymentType contains card network (e.g., "MasterCard *7836") but card_issuer_name is generic (like "Personal"),
      // extract the card type from paymentType for logo detection
      // This ensures logos show correctly even when card_issuer_name doesn't match a network
      if (paymentType && paymentType.includes("*")) {
        const basePaymentType = paymentType.replace(/\s*\*\d{3,4}$/, "").trim();
        const baseLower = basePaymentType.toLowerCase();
        // Check if basePaymentType contains a known card network
        if (baseLower.includes("visa") || baseLower.includes("master") || baseLower.includes("paypal") || 
            baseLower.includes("amex") || baseLower.includes("discover") || baseLower.includes("diners")) {
          // If card_issuer_name is generic and doesn't match a network, don't use it for logo
          // The paymentType extraction below will handle logo detection
          const issuerLower = cardIssuerName.toLowerCase();
          if (issuerLower === "personal" || issuerLower === "business" || issuerLower === "" || 
              (!issuerLower.includes("visa") && !issuerLower.includes("master") && !issuerLower.includes("paypal") &&
               !issuerLower.includes("amex") && !issuerLower.includes("discover") && !issuerLower.includes("diners"))) {
            // card_issuer_name is generic, so paymentType will be used for logo (which is correct)
          }
        }
      }
    } else {
      // It's a string - try to extract card issuer name from payment method string
      paymentType = paymentTypeOrReceipt.toString().trim();
      
      // If it's a payment method string like "Visa *1234", extract "Visa" as cardIssuerName
      if (paymentType && paymentType !== "0") {
        const basePaymentType = paymentType.replace(/\s*\*\d{3,4}$/, "").trim();
        const normalized = basePaymentType.toLowerCase();
        
        // Try to detect card network from the string
        if (normalized.includes("visa")) cardIssuerName = "Visa";
        else if (normalized.includes("master")) cardIssuerName = "MasterCard";
        else if (normalized.includes("amex") || normalized.includes("american express")) cardIssuerName = "American Express";
        else if (normalized.includes("discover")) cardIssuerName = "Discover";
        else if (normalized.includes("diners")) cardIssuerName = "Diners Club";
        else if (normalized.includes("paypal")) cardIssuerName = "PayPal";
        else if (normalized.includes("debit")) cardIssuerName = "Debit Card";
        else if (normalized.includes("cash")) cardIssuerName = "Cash";
        else if (normalized.includes("credit")) cardIssuerName = "Credit Card";
        // If no network detected, use the base payment type as issuer name
        else if (basePaymentType && basePaymentType !== "0") cardIssuerName = basePaymentType;
      }
    }

    // Logo = card type (Visa, MasterCard, etc.), not display name. Prefer card type sources first.
    // Priority 1: paymentType / selectedCardType (card type) for logo
    if (isReceiptObject) {
      // Try selectedCardType first (most specific)
      if (selectedCardType && selectedCardType !== "0" && selectedCardType.trim() !== "") {
        const baseSelected = selectedCardType.replace(/\s*\*\d{3,4}$/, "").trim();
        const normalized = baseSelected.toLowerCase();
        if (normalized === "other") return LOGO_MAP.other;
        const network = detectCardNetwork(baseSelected);
        if (network && LOGO_MAP[network]) {
          return LOGO_MAP[network];
        }
      }
      
      // Then try paymentType (extract card type from "MasterCard *7836" format)
      if (paymentType && paymentType !== "0" && paymentType.trim() !== "") {
        const basePaymentType = paymentType.replace(/\s*\*\d{3,4}$/, "").trim();
        const normalized = basePaymentType.toLowerCase();
        if (normalized === "other") return LOGO_MAP.other;
        const network = detectCardNetwork(basePaymentType);
        if (network && LOGO_MAP[network]) {
          return LOGO_MAP[network];
        }
      }
      
      // Then try paymentBrand
      if (paymentBrand && paymentBrand !== "0" && paymentBrand.trim() !== "") {
        const baseBrand = paymentBrand.replace(/\s*\*\d{3,4}$/, "").trim();
        const normalized = baseBrand.toLowerCase();
        if (normalized === "other") return LOGO_MAP.other;
        const network = detectCardNetwork(baseBrand);
        if (network && LOGO_MAP[network]) {
          return LOGO_MAP[network];
        }
      }
    }

    // Priority 2: card_issuer_name (may be custom like "Chase Sapphire" - only use if it matches a network)
    // IMPORTANT: Skip card_issuer_name if it's generic (like "Personal", "Business") and paymentType contains a network
    // This ensures logos show correctly when card_issuer_name is generic but paymentType has the card type
    if (cardIssuerName && cardIssuerName !== "0" && cardIssuerName.trim() !== "") {
      const issuerLower = cardIssuerName.toLowerCase().trim();
      // Check if card_issuer_name is generic (doesn't contain a card network)
      const isGenericIssuer = issuerLower === "personal" || issuerLower === "business" || 
                              (!issuerLower.includes("visa") && !issuerLower.includes("master") && 
                               !issuerLower.includes("paypal") && !issuerLower.includes("amex") &&
                               !issuerLower.includes("discover") && !issuerLower.includes("diners"));
      
      // If card_issuer_name is generic and paymentType contains a network, skip card_issuer_name
      // and let paymentType detection handle it (which happens in Priority 3 below)
      if (isGenericIssuer && paymentType && paymentType !== "0") {
        const paymentTypeLower = paymentType.toLowerCase();
        if (paymentTypeLower.includes("visa") || paymentTypeLower.includes("master") || 
            paymentTypeLower.includes("paypal") || paymentTypeLower.includes("amex") ||
            paymentTypeLower.includes("discover") || paymentTypeLower.includes("diners")) {
          // Skip generic card_issuer_name, let paymentType be processed in Priority 3
        } else {
          // card_issuer_name is generic but paymentType doesn't have network either, try card_issuer_name
          if (issuerLower === "other") return LOGO_MAP.other;
          const issuerNetwork = detectCardNetwork(cardIssuerName);
          if (issuerNetwork && LOGO_MAP[issuerNetwork]) return LOGO_MAP[issuerNetwork];
        }
      } else {
        // card_issuer_name is not generic, use it for logo detection
        if (issuerLower === "other") return LOGO_MAP.other;
        const issuerNetwork = detectCardNetwork(cardIssuerName);
        if (issuerNetwork && LOGO_MAP[issuerNetwork]) return LOGO_MAP[issuerNetwork];
      }
    }
    
    // Priority 3: paymentType as string (fallback when object had no card type match)
    if (paymentType && paymentType !== "0" && paymentType.trim() !== "") {
      const basePaymentType = paymentType.replace(/\s*\*\d{3,4}$/, "").trim();
      const normalized = basePaymentType.toLowerCase();
      let extractedIssuer = null;
      if (normalized.includes("visa")) extractedIssuer = "Visa";
      else if (normalized.includes("master")) extractedIssuer = "MasterCard";
      else if (normalized.includes("amex") || normalized.includes("american express")) extractedIssuer = "American Express";
      else if (normalized.includes("discover")) extractedIssuer = "Discover";
      else if (normalized.includes("diners")) extractedIssuer = "Diners Club";
      else if (normalized.includes("paypal")) extractedIssuer = "PayPal";
      else if (normalized.includes("debit")) extractedIssuer = "Debit Card";
      else if (normalized.includes("cash")) extractedIssuer = "Cash";
      else if (normalized.includes("credit")) extractedIssuer = "Credit Card";
      if (extractedIssuer) {
        const issuerNetwork = detectCardNetwork(extractedIssuer);
        if (issuerNetwork && LOGO_MAP[issuerNetwork]) return LOGO_MAP[issuerNetwork];
      }
    }

    // Priority 2: Check paymentType (remove last 4 digits pattern (*1234) for network detection)
    if (paymentType && paymentType !== "0" && paymentType.trim() !== "") {
      const basePaymentType = paymentType.replace(/\s*\*\d{3,4}$/, "").trim();
      const normalized = basePaymentType.toLowerCase().replace(/\s+/g, "");
      const normalizedWithSpaces = basePaymentType.toLowerCase().trim();
      
      // Handle "Other" explicitly BEFORE checking for networks
      if (normalizedWithSpaces === "other") {
        return LOGO_MAP.other;
      }
      
      // Direct network detection on paymentType
      // Check for exact matches first, then partial matches
      if (normalized === "paypal" || normalized.includes("paypal")) return LOGO_MAP.paypal;
      if (normalized === "discover" || normalized.includes("discover")) return LOGO_MAP.discover;
      if (normalized.includes("visa")) return LOGO_MAP.visa;
      if (normalized.includes("master")) return LOGO_MAP.mastercard;
      if (normalized.includes("amex") || normalized.includes("americanexpress")) return LOGO_MAP.americanexpress;
      if (normalized.includes("diners")) return LOGO_MAP.dinersclub;
      if (normalized.includes("cash")) return LOGO_MAP.cash;
      if (normalized.includes("debit")) return LOGO_MAP.debitcard;
      if (normalized.includes("credit")) return LOGO_MAP.creditcard;
    }

    // Priority 3: Check paymentBrand field (this is the actual card network from API)
    if (paymentBrand && paymentBrand !== "0" && paymentBrand.trim() !== "") {
      const brandNetwork = detectCardNetwork(paymentBrand);
      if (brandNetwork && LOGO_MAP[brandNetwork]) {
        return LOGO_MAP[brandNetwork];
      }
    }

    // Priority 4: Check for known bank names - show MasterCard logo (like mobile app)
    // Only check bank names if we haven't already detected a known network
    // Use cardIssuerName first (highest priority), then paymentType, then paymentBrand
    const effectivePaymentType = cardIssuerName || paymentType || paymentBrand;
    
    // If we have no effective payment type, return default
    if (!effectivePaymentType || effectivePaymentType === "0" || effectivePaymentType.trim() === "") {
      return LOGO_MAP.other;
    }
    
    const basePaymentTypeForBank = effectivePaymentType.replace(/\s*\*\d{3,4}$/, "").trim();
    const normalizedWithSpaces = basePaymentTypeForBank.toLowerCase();
    const normalizedForNetworkCheck = basePaymentTypeForBank.toLowerCase().replace(/\s+/g, "");
    
    // Skip bank detection if we already detected a known network in Priority 1, 2, or 3
    // Check all possible sources: cardIssuerName (already checked), paymentType, and paymentBrand
    const hasKnownNetwork = 
      (cardIssuerName && detectCardNetwork(cardIssuerName)) ||
      (paymentType && detectCardNetwork(paymentType)) ||
      (paymentBrand && detectCardNetwork(paymentBrand)) ||
      normalizedForNetworkCheck.includes("visa") || 
      normalizedForNetworkCheck.includes("master") ||
      normalizedForNetworkCheck.includes("paypal") ||
      normalizedForNetworkCheck.includes("amex") ||
      normalizedForNetworkCheck.includes("americanexpress") ||
      normalizedForNetworkCheck.includes("discover") ||
      normalizedForNetworkCheck.includes("diners") ||
      normalizedForNetworkCheck.includes("cash") ||
      normalizedForNetworkCheck.includes("debit") ||
      normalizedForNetworkCheck.includes("credit");
    
    // Only check for bank names if paymentType doesn't have a known network AND it's not "Other"
    // "Other" should show credit card icon, not MasterCard
    if (!hasKnownNetwork && basePaymentTypeForBank !== "other" && normalizedWithSpaces !== "other") {
      if (
        normalizedWithSpaces.includes("bank of america") ||
        normalizedWithSpaces.includes("bank one") ||
        normalizedWithSpaces.includes("chase") ||
        normalizedWithSpaces.includes("wells fargo") ||
        normalizedWithSpaces.includes("citibank") ||
        normalizedWithSpaces.includes("citi") ||
        normalizedWithSpaces.includes("capital one") ||
        normalizedWithSpaces.includes("us bank") ||
        normalizedWithSpaces.includes("pnc") ||
        normalizedWithSpaces.includes("td bank") ||
        normalizedWithSpaces.includes("truist") ||
        normalizedWithSpaces.includes("regions") ||
        normalizedWithSpaces.includes("ally") ||
        normalizedWithSpaces.includes("synchrony") ||
        normalizedWithSpaces.includes("barclays") ||
        normalizedWithSpaces.includes("hsbc") ||
        normalizedWithSpaces.includes("citizens") ||
        normalizedWithSpaces.includes("bmo") ||
        normalizedWithSpaces.includes("santander") ||
        normalizedWithSpaces.includes("hdfc") ||
        normalizedWithSpaces.includes("icici") ||
        normalizedWithSpaces.includes("sbi") ||
        normalizedWithSpaces.includes("axis") ||
        normalizedWithSpaces.includes("kotak") ||
        normalizedWithSpaces.includes("pnb") ||
        normalizedWithSpaces.includes("canara") ||
        normalizedWithSpaces.includes("union bank") ||
        normalizedWithSpaces.includes("indian bank") ||
        normalizedWithSpaces.startsWith("bm ") ||
        normalizedWithSpaces.startsWith("bm*") ||
        normalizedWithSpaces.includes(" bm ") ||
        /^bm\s*\*/.test(normalizedWithSpaces)
      ) {
        return LOGO_MAP.bank;
      }
    }

    // Priority 5: Check for "Other" payment type - use credit card icon
    // This MUST come BEFORE bank detection to prevent "Other" from showing MasterCard logo
    const normalized = effectivePaymentType.toLowerCase().replace(/\s+/g, "");
    const normalizedBase = effectivePaymentType.toLowerCase().replace(/\s*\*\d{3,4}$/, "").trim();
    
    // Check for "Other" explicitly (case-insensitive)
    if (normalizedBase === "other" || normalizedBase.trim() === "other") {
      return LOGO_MAP.other;
    }
    
    if (
      normalized.includes("starbucks") ||
      normalized.includes("gift")
    ) {
      return LOGO_MAP.other;
    }

    // Priority 6: If it looks like a card number pattern (e.g., "Something *1234") and we haven't matched a network, show bank logo
    // Only show bank logo if paymentType doesn't contain a known network
    if (!hasKnownNetwork && /\*\d{3,4}$/.test(effectivePaymentType.trim())) {
      return LOGO_MAP.bank;
    }

    // Default to credit card icon for unknown types - ALWAYS return something
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
      return `${issuer}${last4 ? ` *${last4}` : ""}`;
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
        return `${finalName} *${last4DigitCard}`;
      } else {
        return `${basePaymentType} ${cardIssuerName} *${last4DigitCard}`;
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
      return `${cardIssuerName} *${last4DigitCard}`;
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