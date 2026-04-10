import { useState, useCallback, useMemo } from "react";
import { useData } from "../../context/DataContext";

// ✅ Import all payment logos
import Visa from "../../assets/payment/Visa.png";
import MasterCard from "../../assets/payment/MasterCard.png";
import PayPal from "../../assets/payment/PayPal.png";
import AmericanExpress from "../../assets/payment/AmericanExpress.webp";
import Discover from "../../assets/payment/discover.png";
import DinersClub from "../../assets/payment/DinersClub.png";
import Cash from "../../assets/payment/Cash.jpg";
import DebitCard from "../../assets/payment/DebitCard.webp";
import Creditdebitcardicon from "../../assets/payment/Creditdebitcardicon.jpg";

// ✅ Final version
const PaymentFilterMethod = ({ onClose, onApply, initialSelected = [] }) => {
  const { receipts, paymentMethods } = useData();
  const [selectedPaymentMethods, setSelectedPaymentMethods] =
    useState(initialSelected);

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
      const matchingReceipt = receipts.find((r) => {
        const displayName = getPaymentDisplayName(r);
        return normalizeLabel(displayName) === method;
      });
      
      const logo = matchingReceipt
        ? getPaymentLogo(matchingReceipt)
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

  // ✅ Format display name
  const getPaymentDisplayName = useCallback((r) => {
    let issuer = r?.card_issuer_name?.toString?.().trim?.() || null;
    let type = r?.paymentType?.toString?.().trim?.() || null;
    const last4Digit = r?.last_4_digit_card?.toString?.().trim?.() || null;

    if (!issuer && !type) return "-";
    if (type?.toLowerCase().includes("cash")) return "Cash";

    // PRIORITY: Check last_4_digit_card field first (API stores it separately)
    let last4 = "";
    if (last4Digit && last4Digit !== "0" && /^\d{3,4}$/.test(last4Digit)) {
      last4 = last4Digit;
    } else if (type && type.includes("*")) {
      // Fallback: Extract from paymentType if last_4_digit_card not available
      const parts = type.split("*");
      const tail = parts[parts.length - 1];
      last4 = tail?.replace(/\D/g, "").slice(-4) || tail || "";
    }

    // PRIORITY 1: Always use card_issuer_name if available
    if (issuer && issuer !== "0") {
      return `${issuer}${last4 ? ` *${last4}` : ""}`;
    }
    
    // PRIORITY 2: Use paymentType if no issuer
    if (type) {
      return last4 ? `*${last4}` : type;
    }

    return "-";
  }, []);

  // ✅ Normalize label
  const normalizeLabel = (method) => {
    const m = (method || "").toString();
    const lower = m.toLowerCase();
    if (lower === "cash" || lower.startsWith("cash *")) return "Cash";
    return method;
  };

  // ✅ Extract unique payment methods from receipts
  const uniqueMethods = useMemo(() => {
    const set = new Set();
    (receipts || []).forEach((r) => {
      const title = getPaymentDisplayName(r);
      if (title && title !== "-") {
        set.add(normalizeLabel(title));
      }
    });
    (paymentMethods || []).forEach((method) => {
      const normalized = normalizeLabel((method || "").toString().trim());
      if (normalized && normalized !== "-") {
        set.add(normalized);
      }
    });
    const arr = Array.from(set);
    arr.sort((a, b) => a.localeCompare(b));
    return arr;
  }, [receipts, paymentMethods, getPaymentDisplayName]);

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
            const matchingReceipt = receipts.find(r => {
              const displayName = getPaymentDisplayName(r);
              return normalizeLabel(displayName) === paymentMethod;
            });
            
            // Extract issuer name and last4 from payment method string or receipt
            let issuerName = "";
            let last4 = "";
            
            if (matchingReceipt) {
              // Use receipt data if available
              issuerName = matchingReceipt.card_issuer_name || "";
              last4 = matchingReceipt.last_4_digit_card || "";
              
              // If issuer name not in receipt, extract from paymentType
              if (!issuerName && matchingReceipt.paymentType) {
                const parts = matchingReceipt.paymentType.split("*");
                issuerName = parts[0]?.trim() || "";
                if (parts[1]) {
                  last4 = parts[1]?.trim().replace(/\D/g, "").slice(-4) || "";
                }
              }
            } else {
              // Extract from payment method string (format: "Issuer Name *1234")
              const parts = paymentMethod.split("*");
              issuerName = parts[0]?.trim() || "";
              if (parts[1]) {
                last4 = parts[1]?.trim().replace(/\D/g, "").slice(-4) || "";
              }
            }
            
            // Get logo - use receipt if available, otherwise use payment method string
            const logo = matchingReceipt ? getPaymentLogo(matchingReceipt) : getPaymentLogo(paymentMethod);
            
            // Format display: issuer name *last4 (or just issuer name if no last4)
            const displayText = issuerName 
              ? (last4 ? `${issuerName} *${last4}` : issuerName)
              : paymentMethod; // Fallback to original if no issuer name
            
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