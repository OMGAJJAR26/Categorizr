import { useCurrency } from "../context/CurrencyContext";
import { X } from "lucide-react";
import MerchantAvatar from "./MerchantAvatar";
const Visa              = "/payment-logos/Visa.png";
const MasterCard        = "/payment-logos/MasterCard.png";
const PayPal            = "/payment-logos/PayPal.png";
const AmericanExpress   = "/payment-logos/AmericanExpress.webp";
const Discover          = "/payment-logos/discover.png";
const DinersClub        = "/payment-logos/DinersClub.png";
const Cash              = "/payment-logos/Cash.jpg";
const DebitCard         = "/payment-logos/DebitCard.webp";
const Creditdebitcardicon = "/payment-logos/Creditdebitcardicon.jpg";
import { usePaymentDisplay } from "../hooks/usePaymentDisplay";
import { TAG_STATUS_GROUPS } from "../utils/tagStatusGroups";

const STORAGE_KEYS = {
  price: "selectedPriceFilter",
  date: "selectedDateRange",
  merchant: "selectedMerchants",
  expenseCategory: "selectedExpenseCategory",
  receiptCategory: "selectedReceiptCategories",
  paymentMethod: "selectedPaymentMethods",
  sortOrder: "sortOrder",
  sortDate: "sortDate",
  sortAmount: "sortAmount",
  taxTypes: "selectedTaxAndTipsTypes",
  tags: "selectedTags", // Added for tags
};

// Payment logos map and helper
const paymentLogoMap = {
  visa: Visa,
  mastercard: MasterCard,
  paypal: PayPal,
  americanexpress: AmericanExpress,
  discover: Discover,
  dinersclub: DinersClub,
  cash: Cash,
  debitcard: DebitCard,
  bank: MasterCard, // MasterCard logo for bank cards (like mobile app)
  other: Creditdebitcardicon,
};

// Helper function to get tag display label
const getTagDisplayLabel = (tagKey) => {
  for (const group of TAG_STATUS_GROUPS) {
    const option = group.options.find((item) => item.key === tagKey);
    if (option) return option.label;
  }
  return tagKey;
};

const getPaymentLogo = (label = "") => {
  const raw = label.toString().trim().toLowerCase();
  const simple = raw.replace(/[\s+,&_.:;-]+/g, "");

  if (raw.includes("cash")) return paymentLogoMap.cash;
  if (simple.includes("visa")) return paymentLogoMap.visa;
  if (simple.includes("master")) return paymentLogoMap.mastercard;
  if (simple.includes("paypal")) return paymentLogoMap.paypal;
  if (simple.includes("americanexpress") || simple.includes("amex")) return paymentLogoMap.americanexpress;
  if (simple.includes("discover")) return paymentLogoMap.discover;
  if (simple.includes("diners")) return paymentLogoMap.dinersclub;
  if (simple.includes("debit")) return paymentLogoMap.debitcard;
  if (simple.includes("credit")) return paymentLogoMap.other;

  // Check for known bank names - show MasterCard logo (like mobile app)
  if (
    raw.includes("bank of america") ||
    raw.includes("bank one") ||
    raw.includes("chase") ||
    raw.includes("wells fargo") ||
    raw.includes("citibank") ||
    raw.includes("citi") ||
    raw.includes("capital one") ||
    raw.includes("us bank") ||
    raw.includes("pnc") ||
    raw.includes("td bank") ||
    raw.includes("truist") ||
    raw.includes("regions") ||
    raw.includes("ally") ||
    raw.includes("synchrony") ||
    raw.includes("barclays") ||
    raw.includes("hsbc") ||
    raw.includes("citizens") ||
    raw.includes("bmo") ||
    raw.includes("santander") ||
    raw.startsWith("bm ") ||
    raw.startsWith("bm*") ||
    raw.includes(" bm ") ||
    /^bm\s*\*/.test(raw)
  ) {
    return paymentLogoMap.bank;
  }

  // If it looks like a card number pattern (e.g., "Something *1234"), show bank logo
  if (/\*\d{3,4}$/.test(label.toString().trim())) {
    return paymentLogoMap.bank;
  }

  return paymentLogoMap.other;
};

const ActiveFiltersBar = ({
  filters,
  sortConfig,
  searchTerm,
  onRemoveFilter,
  onClearAll,
}) => {
  const { formatCurrency } = useCurrency();
  const { getDetailedPaymentDisplay } = usePaymentDisplay(); // Use the hook
  const activeFilters = [];

  // Extract filter values
  const selectedPriceFilter = filters.price;
  const selectedDateRange = filters.date;
  const selectedMerchants = filters.merchant || [];
  const selectedMerchantsData = filters.merchantData || [];
  const selectedExpenseCategory = filters.expenseCategory || [];
  const selectedReceiptCategories = filters.receiptCategory || [];
  const selectedPaymentMethods = filters.paymentMethod || [];
  const selectedPaymentMethodsData = filters.paymentMethodData || [];
  const selectedTaxAndTipsTypes = filters.taxTypes || [];
  const selectedTags = filters.tags || [];

  // Extract sort values
  const sortOrder = sortConfig.order;
  const sortDate = sortConfig.date;
  const sortAmount = sortConfig.amount;

  if (selectedPriceFilter) {
    const label =
      selectedPriceFilter.type === "range"
        ? `Total : ${formatCurrency(
            selectedPriceFilter.min
          )} - ${formatCurrency(selectedPriceFilter.max)}`
        : `Total : ${formatCurrency(selectedPriceFilter.value)}`;
    activeFilters.push({ label, key: "price" });
  }

  if (selectedDateRange) {
    activeFilters.push({
      label: `Date : ${selectedDateRange.startDate.toLocaleDateString()} - ${selectedDateRange.endDate.toLocaleDateString()}`,
      key: "date",
    });
  }

  if (selectedMerchants.length > 0) {
    const maxToShow = 3;
    const namesToShow = selectedMerchants.slice(0, maxToShow);
    const remaining = selectedMerchants.length - namesToShow.length;

    activeFilters.push({
      key: "merchant",
      element: (
        <span className="inline-flex items-center gap-4">
          <span className="font-semibold">Merchant :</span>
          {namesToShow.map((name, idx) => {
            if (!name || name.trim() === "") return null; // Skip empty names
            const data = (selectedMerchantsData || []).find(
              (m) => m?.name === name
            );
            const explicitUrl = data?.image;
            return (
              <span key={`merchant-${name}-${idx}`} className="inline-flex items-center gap-2 mr-3">
                <MerchantAvatar
                  name={name}
                  explicitUrl={explicitUrl}
                  storename={name}
                  className="w-5 h-5"
                />
                <span>{name}</span>
              </span>
            );
          })}
          {remaining > 0 && (
            <span className="text-gray-600">+{remaining} more</span>
          )}
        </span>
      ),
    });
  }

  if (selectedExpenseCategory.length > 0) {
    activeFilters.push({
      label: `Expense Category : ${selectedExpenseCategory.join(", ")}`,
      key: "expenseCategory",
    });
  }

  if (selectedReceiptCategories.length > 0) {
    activeFilters.push({
      label: `Expense Type : ${selectedReceiptCategories
        .map((v) => (v === "0" ? "Personal" : "Business"))
        .join(", ")}`,
      key: "receiptCategory",
    });
  }

  if (selectedPaymentMethods.length > 0) {
    const maxToShow = 3;
    const methodsToShow = selectedPaymentMethods.slice(0, maxToShow);
    const remaining = selectedPaymentMethods.length - methodsToShow.length;

    activeFilters.push({
      key: "paymentMethod",
      element: (
        <span className="inline-flex items-center gap-4">
          <span className="font-semibold">Payment Method :</span>
          {methodsToShow.map((method, idx) => {
            if (!method || method.trim() === "") return null; // Skip empty methods
            const item = (selectedPaymentMethodsData || []).find((m) => m?.label === method);
            const logoSrc = item?.logo || getPaymentLogo(method);
            
            // Use getDetailedPaymentDisplay with the item data
            let displayLabel = method;
            if (item) {
              // Create a mock receipt object for getDetailedPaymentDisplay
              const mockReceipt = {
                paymentType: item.paymentType || item.label || method,
                card_issuer_name: item.issuer || null,
                last_4_digit_card: item.last4 || null
              };
              
              const detailedDisplay = getDetailedPaymentDisplay(mockReceipt);
              if (detailedDisplay && detailedDisplay !== "—") {
                displayLabel = detailedDisplay;
              }
            }
            
            return (
              <span key={`payment-${method}-${idx}`} className="inline-flex items-center gap-2 mr-3">
                {logoSrc && (
                  <img src={logoSrc} alt={displayLabel} className="w-5 h-5 object-contain" />
                )}
                <span>{displayLabel}</span>
              </span>
            );
          })}
          {remaining > 0 && (
            <span className="text-gray-600">+{remaining} more</span>
          )}
        </span>
      ),
    });
  }

  // Added tag filters display
  if (selectedTags.length > 0) {
    const maxToShow = 3;
    const tagsToShow = selectedTags.slice(0, maxToShow);
    const remaining = selectedTags.length - tagsToShow.length;

    activeFilters.push({
      key: "tags",
      element: (
        <span className="inline-flex items-center gap-4">
          <span className="font-semibold">Tags :</span>
          {tagsToShow.map((tag, idx) => (
            <span key={`tag-${tag}-${idx}`} className="inline-flex items-center gap-2 mr-3 bg-purple-100 text-purple-800 px-2 py-1 rounded">
              {getTagDisplayLabel(tag)}
            </span>
          ))}
          {remaining > 0 && (
            <span className="text-gray-600">+{remaining} more</span>
          )}
        </span>
      ),
    });
  }

  if (sortOrder) {
    activeFilters.push({ label: `Sort Order : ${sortOrder === 'az' ? 'A to Z' : 'Z to A'}`, key: "sortOrder" });
  }
  if (sortDate) {
    activeFilters.push({ label: `Sort By Date : ${sortDate === 'newest' ? 'Newest First' : 'Oldest First'}`, key: "sortDate" });
  }
  if (sortAmount) {
    activeFilters.push({
      label: `Sort By Amount : ${sortAmount === 'asc' ? 'Lowest First' : 'Highest First'}`,
      key: "sortAmount",
    });
  }

  if (selectedTaxAndTipsTypes.length > 0) {
    activeFilters.push({
      label: `Tax Types : ${selectedTaxAndTipsTypes.join(", ")}`,
      key: "taxTypes",
    });
  }

  // Also show search term if active
  if (searchTerm && searchTerm.trim()) {
    activeFilters.push({
      label: `Search : "${searchTerm}"`,
      key: "search",
    });
  }

  if (activeFilters.length === 0) return null;

  const handleRemove = (key) => {
    const storageKey = STORAGE_KEYS[key];
    if (storageKey) {
      try {
        if (key === "tags") {
          // Clear all tags from localStorage
          localStorage.removeItem(storageKey);
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch {}
    }
    onRemoveFilter(key);
  };

  const handleClearAll = () => {
    try {
      Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    } catch {}
    onClearAll();
  };

  return (
    <div className="flex items-center px-6 py-2 bg-gray-100 border-b gap-3 flex-nowrap overflow-x-auto rounded-3xl mt-4">
      {activeFilters.map((filter) => (
        <span
          key={filter.key}
          className="flex items-center font-mono text-gray-800 bg-white border-gray-300 px-3 py-1 rounded-xl whitespace-nowrap"
        >
          {filter.element || filter.label}
          <button
            onClick={() => handleRemove(filter.key)}
            className="ml-2 text-blue-600 hover:text-red-600 m-0 w-auto flex items-center justify-center"
            aria-label={`Remove ${filter.key}`}
            title="Remove"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </span>
      ))}
      <button
        onClick={handleClearAll}
        className="ml-auto text-red-500 hover:underline font-mono w-auto"
      >
        Clear All
      </button>
    </div>
  );
};

export default ActiveFiltersBar;