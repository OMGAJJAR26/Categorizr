import { parseReceiptTags } from "./receiptFormatters";

// Helper function for search aliases
const getSearchAliases = (issuer) => {
  const normalized = issuer.toLowerCase();
  if (normalized.includes("bank of america")) return "boa bm bankofamerica";
  if (normalized.includes("american express")) return "amex ae americanexpress";
  if (normalized.includes("hdfc")) return "hdfc housingdevelopmentfinance";
  if (normalized.includes("icici")) return "icici";
  if (normalized.includes("sbi")) return "sbi statebankofindia";
  if (normalized.includes("axis")) return "axis";
  if (normalized.includes("kotak")) return "kotak";
  return "";
};

// Filter functions
const matchesSearch = (receipt, searchTerm) => {
  if (!searchTerm.trim()) return true;

  const search = searchTerm.toLowerCase().trim();
  const displayTitle = receipt?.paymentType || "-";
  const issuer = receipt?.card_issuer_name?.toString()?.trim?.() || "";
  const displayNorm = displayTitle.toLowerCase();
  const issuerNorm = issuer.toLowerCase();
  const issuerAliases = getSearchAliases(issuerNorm);

  const catVal = Number(receipt.receipt_category);
  const catText = catVal === 0 ? "personal" : catVal === 1 ? "business" : "";

  const searchFields = [
    receipt.storeName?.toLowerCase(),
    receipt.expense_type?.toLowerCase(),
    receipt.merchant?.toLowerCase(),
    receipt.paymentType?.toLowerCase(),
    displayNorm,
    issuerNorm,
    receipt.productname?.toLowerCase(),
    receipt.notes?.toLowerCase(),
    catText,
    (receipt.purchasePrice ?? "").toString().toLowerCase(),
    receipt.product_date
      ? new Date(Number(receipt.product_date) * 1000)
          .toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
          .toLowerCase()
      : "",
  ].filter(Boolean);

  return (
    searchFields.some((field) => field.includes(search)) ||
    issuerAliases.includes(search)
  );
};

const matchesForwardedReceived = (receipt, selectedTags) => {
  if (!selectedTags || !selectedTags.length) return true;

  const hasForwarded = selectedTags.includes("forwarded");
  const hasReceived = selectedTags.includes("received");

  if (!hasForwarded && !hasReceived) return true;

  const status = receipt.badgeStatus;

  if (hasForwarded && hasReceived) {
    return status === "forwarded" || status === "received" || status === "both";
  }

  if (hasForwarded) {
    return status === "forwarded" || status === "both";
  }

  if (hasReceived) {
    return status === "received" || status === "both";
  }

  return true;
};

const matchesPrice = (receipt, priceFilter) => {
  if (!priceFilter) return true;

  const price = Number(receipt.purchasePrice);

  if (priceFilter.type === "greaterThan") {
    return price >= Number(priceFilter.value || 0);
  } else if (priceFilter.type === "range") {
    const minV = Number(priceFilter.min ?? 0);
    const maxV =
      priceFilter.max == null || priceFilter.max === ""
        ? Infinity
        : Number(priceFilter.max);
    return price >= minV && price <= maxV;
  }

  return true;
};

const matchesDate = (receipt, dateRange) => {
  if (!dateRange || !receipt.product_date) return true;

  const productDate = new Date(Number(receipt.product_date) * 1000);
  return productDate >= dateRange.startDate && productDate <= dateRange.endDate;
};

const matchesMerchants = (receipt, merchants) => {
  if (!merchants || !merchants.length) return true;

  const normalizeMerchant = (s = "") =>
    (s || "")
      .toString()
      .trim()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, " ")
      .toLowerCase();

  const rNorm = normalizeMerchant(receipt.storeName || receipt.merchant || "");
  const selectedNorms = merchants.map(normalizeMerchant);

  return selectedNorms.includes(rNorm);
};

const matchesCategory = (receipt, categories) => {
  if (!categories || !categories.length) return true;
  return categories.includes(receipt.expense_type);
};

const matchesReceiptCategory = (receipt, categories) => {
  if (!categories || !categories.length) return true;
  const receiptCat = String(receipt.receipt_category);
  return categories.includes(receiptCat);
};

const matchesPaymentMethod = (receipt, paymentMethods, getPaymentDisplay) => {
  if (!paymentMethods || !paymentMethods.length) return true;

  const displayTitleForFilter = getPaymentDisplay(receipt);
  return paymentMethods.includes(displayTitleForFilter);
};

const matchesTaxTypes = (receipt, taxTypes) => {
  if (!taxTypes || !taxTypes.length) return true;

  const toTaxLabel = (tax) => {
    const name = tax?.tax_name?.toString().trim() || "Unknown";
    if (name.toLowerCase().startsWith("tip")) return "Tip";
    const val =
      tax?.tax_rate != null
        ? parseFloat(String(tax.tax_rate).replace(/%/g, ""))
        : 0;
    const rounded = Math.round(isNaN(val) ? 0 : val);
    return `${name} | ${rounded}%`;
  };

  const taxLabels = Array.isArray(receipt?.receipt_tax_values)
    ? receipt.receipt_tax_values.map(toTaxLabel)
    : [];

  const hasTip = Array.isArray(receipt?.receipt_tax_values)
    ? receipt.receipt_tax_values.some((t) =>
        (t?.tax_name || "").toLowerCase().includes("tip")
      )
    : false;

  return taxTypes.some((selected) => {
    if (selected === "Tip") return hasTip;
    return taxLabels.includes(selected);
  });
};

const matchesTags = (receipt, selectedTags) => {
  if (!selectedTags || !selectedTags.length) return true;

  const receiptTags = parseReceiptTags(receipt.receipt_tag);
  if (!receiptTags) return false;

  return selectedTags.some((tag) => {
    // Handle status tags separately
      if (
      tag === "unread" ||
      tag === "read" ||
      tag === "forwarded" ||
      tag === "received"
    ) {
      return true;
    }
      switch (tag) {
        case "verified":
          return receiptTags.verified;
        case "starred":
          return receiptTags.starred;
        case "flagged":
          return receiptTags.flagged;
        case "locked":
          return receiptTags.locked;
        case "reconciled":
          return receiptTags.reconciled;
        case "reimbursed":
          return receiptTags.reimbursed;
        case "warrantied":
          return receiptTags.warrantied;
        case "unverified":
          return !receiptTags.verified;
        case "unstarred":
          return !receiptTags.starred;
        case "unflagged":
          return !receiptTags.flagged;
        case "unlocked":
          return !receiptTags.locked;
        case "unreconciled":
          return !receiptTags.reconciled;
        case "unreimbursed":
          return !receiptTags.reimbursed;
        case "unwarrantied":
          return !receiptTags.warrantied;
        default:
          return false;
      }
  });
};

// Check if receipt matches status filter (unread/read)
const matchesStatus = (receipt, selectedTags) => {
  if (!selectedTags || !selectedTags.length) return true;

  const hasUnread = selectedTags.includes("unread");
  const hasRead = selectedTags.includes("read");

  // If neither selected → allow all
  if (!hasUnread && !hasRead) return true;

  // If both selected → allow all
  if (hasUnread && hasRead) return true;

  // Only unread
  if (hasUnread) return receipt.status === "0";

  // Only read
  if (hasRead) return receipt.status === "1";

  return true;
};


// Main filter function
export const filterReceipts = (receipts, filters, searchTerm) => {
  return receipts.filter((receipt) => {
    // We need getPaymentDisplay function here - will be provided by caller
    // This is a simplified version
    const getPaymentDisplay = (r) => {
      const issuer = r?.card_issuer_name?.toString?.().trim?.() || null;
      const type = r?.paymentType?.toString?.().trim?.() || null;
      if (!issuer && !type) return "-";
      if (type?.toLowerCase().includes("cash")) return "Cash";
      const last4 = type?.includes("*") ? type.split("*").pop() : "";
      if (issuer) return `${issuer}${last4 ? ` *${last4}` : ""}`;
      if (type) return last4 ? `*${last4}` : type;
      return "-";
    };

    return (
      matchesSearch(receipt, searchTerm) &&
      matchesPrice(receipt, filters.price) &&
      matchesDate(receipt, filters.date) &&
      matchesMerchants(receipt, filters.merchant) &&
      matchesCategory(receipt, filters.expenseCategory) &&
      matchesReceiptCategory(receipt, filters.receiptCategory) &&
      matchesPaymentMethod(receipt, filters.paymentMethod, getPaymentDisplay) &&
      matchesTaxTypes(receipt, filters.taxTypes) &&
      matchesStatus(receipt, filters.tags) &&
      matchesTags(receipt, filters.tags) &&
      matchesForwardedReceived(receipt, filters.tags)
    );
  });
};
