import { useState, useCallback, useMemo, useEffect } from "react";
import { useData } from "../../context/DataContext";
import { getPaymentDisplayFromReceipt } from "../../hooks/usePaymentDisplay";
import {
  getApiPaymentMethodDisplayName,
  mergePaymentMethodLabels,
  normalizePaymentListLabel,
  normalizePaymentMatchKey,
} from "../../utils/paymentMethodUtils";

// ✅ Import all payment logos
const Visa              = "/payment-logos/Visa.png";
const MasterCard        = "/payment-logos/MasterCard.png";
const PayPal            = "/payment-logos/PayPal.png";
const AmericanExpress   = "/payment-logos/AmericanExpress.webp";
const Discover          = "/payment-logos/discover.png";
const DinersClub        = "/payment-logos/DinersClub.png";
const Cash              = "/payment-logos/Cash.jpg";
const DebitCard         = "/payment-logos/DebitCard.webp";
const Creditdebitcardicon = "/payment-logos/Creditdebitcardicon.jpg";

// ✅ Final version
const CARD_TYPE_INT_TO_NAME = {
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

const PaymentFilterMethod = ({ onClose, onApply, initialSelected = [] }) => {
  const {
    receipts,
    apiPaymentMethods,
    paymentMethods,
    fetchApiPaymentMethods,
    isPaymentMethodHidden,
  } = useData();
  const [selectedPaymentMethods, setSelectedPaymentMethods] =
    useState(initialSelected);

  useEffect(() => {
    fetchApiPaymentMethods();
  }, [fetchApiPaymentMethods]);

  // Logo map - matching usePaymentDisplay.js
  const logoMap = {
    visa: Visa,
    mastercard: MasterCard,
    paypal: PayPal,
    americanexpress: AmericanExpress,
    discover: Discover,
    dinersclub: DinersClub,
    cash: Cash,
    debitcard: DebitCard,
    creditcard: Creditdebitcardicon,
    bank: MasterCard, // MasterCard logo for bank cards (like mobile app)
    other: Creditdebitcardicon, // Credit card icon for Starbucks, gift cards, other
  };
  const cardTypeLogoMap = {
    "visa": logoMap.visa,
    "mastercard": logoMap.mastercard,
    "american express": logoMap.americanexpress,
    "discover": logoMap.discover,
    "diners club": logoMap.dinersclub,
    "paypal": logoMap.paypal,
    "debit card": logoMap.debitcard,
    "cash": logoMap.cash,
    "other": logoMap.other,
  };
  const payCardSelectionMap = useMemo(() => {
    try {
      const raw = JSON.parse(
        localStorage.getItem("cat_pay_card_types") ||
        localStorage.getItem("cat_pay_card_map") ||
        "{}"
      );
      if (!raw || typeof raw !== "object") return {};
      return raw;
    } catch {
      return {};
    }
  }, []);
  const normalizeMethodKey = useCallback((value) => {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }, []);
  const getMappedCardTypeForMethod = useCallback((method) => {
    const direct = payCardSelectionMap[method];
    if (direct) return direct;
    const normalizedMethod = normalizeMethodKey(method);
    const entries = Object.entries(payCardSelectionMap || {});
    const exactNormalized = entries.find(([k]) => normalizeMethodKey(k) === normalizedMethod);
    if (exactNormalized) return exactNormalized[1];
    const methodBase = normalizeMethodKey(String(method || "").replace(/\s*\*\s*\d{3,4}\s*$/g, ""));
    const byBase = entries.find(([k]) => {
      const keyBase = normalizeMethodKey(String(k || "").replace(/\s*\*\s*\d{3,4}\s*$/g, ""));
      return keyBase && keyBase === methodBase;
    });
    return byBase ? byBase[1] : null;
  }, [normalizeMethodKey, payCardSelectionMap]);

  // Improved logo detection - matching usePaymentDisplay.js logic
  const getPaymentLogo = (r) => {
    let paymentType = "";
    let cardIssuerName = "";

    // If we're passed a receipt object
    if (r && typeof r === 'object') {
      paymentType = (r.paymentType || "").toString().trim();
      cardIssuerName = (r.card_issuer_name || "").toString().trim();
      
      // PRIORITY 1: Check card_issuer_name first for logo detection
      if (cardIssuerName && cardIssuerName !== "0") {
        const issuerLower = cardIssuerName.toLowerCase().trim();
        if (issuerLower.includes("visa")) return logoMap.visa;
        if (issuerLower.includes("master")) return logoMap.mastercard;
        if (issuerLower.includes("paypal")) return logoMap.paypal;
        if (issuerLower.includes("amex") || issuerLower.includes("american express")) return logoMap.americanexpress;
        if (issuerLower.includes("discover")) return logoMap.discover;
        if (issuerLower.includes("diners")) return logoMap.dinersclub;
        if (issuerLower.includes("cash")) return logoMap.cash;
        if (issuerLower.includes("debit")) return logoMap.debitcard;
        if (issuerLower.includes("credit")) return logoMap.creditcard;
      }
    } else {
      // If we're passed a string
      paymentType = (r || "").toString().trim();
      const selectedCardType = getMappedCardTypeForMethod(paymentType);
      const selectedLogo = cardTypeLogoMap[(selectedCardType || "").toString().toLowerCase()];
      if (selectedLogo) return selectedLogo;
    }

    if (!paymentType) return logoMap.other;

    // Remove last 4 digits pattern (*1234) for network detection - do this FIRST
    const basePaymentType = paymentType.replace(/\s*\*\d{3,4}$/, "").trim();
    const normalized = basePaymentType.toLowerCase().replace(/\s+/g, "");
    const normalizedWithSpaces = basePaymentType.toLowerCase();

    // Check for card networks first (on base type without *1234) - PRIORITY 1
    if (normalized.includes("visa")) return logoMap.visa;
    if (normalized.includes("master")) return logoMap.mastercard;
    if (normalized.includes("paypal")) return logoMap.paypal;
    if (normalized.includes("amex") || normalized.includes("americanexpress")) return logoMap.americanexpress;
    if (normalized.includes("discover")) return logoMap.discover;
    if (normalized.includes("diners")) return logoMap.dinersclub;
    if (normalized.includes("cash")) return logoMap.cash;
    if (normalized.includes("debit")) return logoMap.debitcard;
    if (normalized.includes("credit")) return logoMap.creditcard;

    // Check for "Other" payment type or gift cards - PRIORITY 2
    if (
      normalized === "other" ||
      normalized.includes("starbucks") ||
      normalized.includes("gift")
    ) {
      return logoMap.other;
    }

    // Check for known bank names - show MasterCard logo (like mobile app) - PRIORITY 3
    // Only check bank names if paymentType doesn't contain a known network
    const hasKnownNetwork = normalized.includes("visa") || 
                           normalized.includes("master") ||
                           normalized.includes("paypal") ||
                           normalized.includes("amex") ||
                           normalized.includes("americanexpress") ||
                           normalized.includes("discover") ||
                           normalized.includes("diners") ||
                           normalized.includes("cash") ||
                           normalized.includes("debit") ||
                           normalized.includes("credit");
    
    // Only check for bank names if paymentType doesn't have a known network
    if (!hasKnownNetwork) {
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
        return logoMap.bank;
      }
    }

    // Priority 4: If it looks like a card number pattern (e.g., "Something *1234") and we haven't matched a network, show bank logo
    // Only show bank logo if paymentType doesn't contain a known network
    if (!hasKnownNetwork && /\*\d{3,4}$/.test(paymentType.trim())) {
      return logoMap.bank;
    }

    // Default to credit card icon for unknown types
    return logoMap.other;
  };

  // ✅ Toggle selection
  const togglePaymentMethod = (paymentMethod) => {
    setSelectedPaymentMethods((prev) =>
      prev.includes(paymentMethod)
        ? prev.filter((p) => p !== paymentMethod)
        : [...prev, paymentMethod]
    );
  };

  // ✅ Apply button
  const handleApply = () => {
    localStorage.setItem(
      "selectedPaymentMethods",
      JSON.stringify(selectedPaymentMethods)
    );

    // Build methodsData with label, logo, and detailed receipt info
    const methodsData = selectedPaymentMethods.map((method) => {
      const methodKey = normalizePaymentMatchKey(method);
      const matchingReceipt = receipts.find((r) => {
        const displayName = getPaymentDisplayFromReceipt(r);
        return normalizePaymentMatchKey(normalizePaymentListLabel(displayName)) === methodKey;
      });
      
      const logo = matchingReceipt
        ? (getPaymentLogo(method) || getPaymentLogo(matchingReceipt))
        : getPaymentLogo(method);
      
      // Extract detailed payment information
      let issuer = null;
      let last4 = null;
      let paymentType = method;
      
      if (matchingReceipt) {
        issuer = matchingReceipt.card_issuer_name || null;
        paymentType = matchingReceipt.paymentType || method;
        
        // Extract last 4 digits from paymentType if it contains *
        if (paymentType && paymentType.includes("*")) {
          const parts = paymentType.split("*");
          const tail = parts[parts.length - 1];
          last4 = tail?.replace(/\D/g, "").slice(-4) || tail || null;
        }
      } else {
        // Try to extract from the method string itself
        // Check if method contains * for last 4 digits
        if (method.includes("*")) {
          const parts = method.split("*");
          const tail = parts[parts.length - 1];
          last4 = tail?.replace(/\D/g, "").slice(-4) || tail || null;
        }
      }
      
      return { 
        label: method, 
        logo,
        issuer: issuer,
        last4: last4,
        paymentType: paymentType
      };
    });

    onApply(selectedPaymentMethods, methodsData);
    onClose();
  };

  // ✅ Clear All button
  const handleClearAll = () => {
    setSelectedPaymentMethods([]);
    localStorage.removeItem("selectedPaymentMethods");
  };

  const apiLabelForMethod = useCallback((m) => getApiPaymentMethodDisplayName(m), []);

  // Same merge as DataContext / Settings / Add Receipt — API-backed canonical list.
  const uniqueMethods = useMemo(
    () =>
      mergePaymentMethodLabels({
        baseLabels: paymentMethods || [],
        apiPaymentMethods: apiPaymentMethods || [],
        isHidden: isPaymentMethodHidden,
      }),
    [apiPaymentMethods, paymentMethods, isPaymentMethodHidden]
  );

  // ✅ Select all
  const handleSelectAll = () => {
    setSelectedPaymentMethods(uniqueMethods);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30 z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 w-full max-w-[30rem]">
        <h2 className="text-lg font-semibold mb-4">Select Payment Methods</h2>

        <div className="max-h-48 overflow-y-auto">
          {uniqueMethods.map((paymentMethod) => {
            // Find the first receipt with this payment method to get its logo and details
            const methodKey = normalizePaymentMatchKey(paymentMethod);
            const matchingReceipt = receipts.find((r) => {
              const displayName = getPaymentDisplayFromReceipt(r);
              return normalizePaymentMatchKey(normalizePaymentListLabel(displayName)) === methodKey;
            });
            const matchingApi = (apiPaymentMethods || []).find(
              (m) => normalizePaymentMatchKey(apiLabelForMethod(m)) === methodKey
            );

            const displayText = matchingReceipt
              ? getPaymentDisplayFromReceipt(matchingReceipt)
              : paymentMethod;

            const storedLogo = (matchingApi?.icon_image || "").trim();
            const logo =
              (storedLogo.startsWith("/payment-logos/") ||
                /^https?:\/\//i.test(storedLogo)
                ? storedLogo
                : null) ||
              (matchingReceipt ? getPaymentLogo(matchingReceipt) : getPaymentLogo(paymentMethod));
            
            return (
              <label
                key={paymentMethod}
                className="flex items-center space-x-2 mb-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedPaymentMethods.includes(paymentMethod)}
                  onChange={() => togglePaymentMethod(paymentMethod)}
                  style={{ width: "auto" }}
                />
                {logo && (
                  <img
                    src={logo}
                    alt={displayText}
                    className="w-6 h-6 object-contain bg-transparent"
                  />
                )}
                <span>{displayText}</span>
              </label>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-[repeat(2,1fr)] gap-2.5">
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 m-0"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 m-0"
          >
            Apply
          </button>
          <button
            onClick={handleSelectAll}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 m-0"
          >
            Select All
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 m-0"
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentFilterMethod;