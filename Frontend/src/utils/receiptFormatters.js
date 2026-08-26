export const parseReceiptTags = (receiptTagString) => {
  if (!receiptTagString) return null;

  const tags = receiptTagString.split(",").map((tag) => tag.trim());

  return {
    locked: tags[0] === "1",
    starred: tags[1] === "1",
    flagged: tags[2] === "1",
    verified: tags[3] === "1",
    reconciled: tags[4] === "1",
    reimbursed: tags[5] === "1",
    warrantied: tags[6] === "1",
  };
};

/** Serialize tag booleans to the API `receipt_tag` comma-separated format. */
export const encodeReceiptTags = (tags) =>
  [
    tags.locked ? "1" : "0",
    tags.starred ? "1" : "0",
    tags.flagged ? "1" : "0",
    tags.verified ? "1" : "0",
    tags.reconciled ? "1" : "0",
    tags.reimbursed ? "1" : "0",
    tags.warrantied ? "1" : "0",
  ].join(",");

export const getTagDisplayName = (tagName) => {
  const displayNames = {
    verified: "Verified",
    starred: "Starred",
    flagged: "Flagged",
    locked: "Locked",
    reconciled: "Reconciled",
    reimbursed: "Reimbursement",
    warrantied: "Warrantied",
  };
  
  return displayNames[tagName] || tagName;
};

export const formatCurrencyFixed2 = (amount, currency = "USD", language = "en-US") => {
  const getLocaleForLanguage = (lang) => {
    switch ((lang || "").toString()) {
      case "Spanish":
        return "es-ES";
      case "India":
        return "hi-IN";
      case "Canadian":
        return "en-CA";
      default:
        return "en-US";
    }
  };

  const num = Number(amount) || 0;
  const locale = getLocaleForLanguage(language);
  
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch (_) {
    return num.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
};

// Format a tax rate with up to 3 decimal places, stripping trailing zeros.
// Examples: 9.980 → "9.98", 6.700 → "6.7", 5.000 → "5", 9.905 → "9.905"
export const formatTaxRate = (rate) => {
  const num = parseFloat(String(rate ?? "").replace(/%/g, ""));
  if (isNaN(num)) return "0";
  return parseFloat(num.toFixed(3)).toString();
};

/** Stable key for merging tax lists (handles "18" vs "18.000" vs 18). */
export const taxTypeDedupKey = (tax) => {
  const name = (tax?.tax_name || "").toString().trim().toLowerCase();
  if (!name || name.includes("tip")) return "";
  return `${name}|${formatTaxRate(tax?.tax_rate)}`;
};

/** True when two tax rows refer to the same type (name + normalized rate). */
export const taxTypesMatch = (a, b) => {
  const keyA = taxTypeDedupKey(a);
  const keyB = taxTypeDedupKey(b);
  return keyA !== "" && keyA === keyB;
};

/** True when a receipt tax line belongs to a tax definition (same id or name, rate ignored). */
export const taxDefinitionMatchesReceiptLine = (receiptLine, taxDefinition) => {
  const defId = parseInt(taxDefinition?.id) || 0;
  const lineId = parseInt(receiptLine?.fk_tax_id) || 0;
  if (defId > 0 && lineId > 0 && defId === lineId) return true;
  const defName = (taxDefinition?.tax_name || "").toString().trim().toLowerCase();
  const lineName = (receiptLine?.tax_name || "").toString().trim().toLowerCase();
  if (!defName || defName.includes("tip")) return false;
  return defName === lineName;
};

export const toTaxLabel = (tax) => {
  const name = tax?.tax_name?.toString().trim() || "Unknown";
  if (name.toLowerCase().startsWith("tip")) return "Tip";
  const val = tax?.tax_rate != null
    ? parseFloat(String(tax.tax_rate).replace(/%/g, ""))
    : 0;
  return `${name} | ${formatTaxRate(isNaN(val) ? 0 : val)}%`;
};

/** Required fields before split/duplicate: Date, Merchant, Expense Category, Total. */
function getReceiptPrereqValidationMessage(fields, action) {
  if (!fields) {
    return `Please enter Date, Merchant, Expense Category, and Total before ${action} this receipt.`;
  }
  const missing = [];
  if (fields.product_date == null || String(fields.product_date).trim() === "") {
    missing.push("Date");
  }
  if (fields.storeName == null || String(fields.storeName).trim() === "") {
    missing.push("Merchant");
  }
  if (fields.expense_type == null || String(fields.expense_type).trim() === "") {
    missing.push("Expense Category");
  }
  const rawTotal = fields.purchasePrice;
  if (rawTotal == null || String(rawTotal).trim() === "") {
    missing.push("Total");
  } else {
    const total = parseFloat(String(rawTotal).trim());
    if (!Number.isFinite(total) || total === 0) {
      missing.push("Total");
    }
  }
  if (!missing.length) return null;
  if (missing.length === 1) {
    return `Please enter ${missing[0]} before ${action} this receipt.`;
  }
  const last = missing.pop();
  return `Please enter ${missing.join(", ")} and ${last} before ${action} this receipt.`;
}

export function getSplitReceiptValidationMessage(fields) {
  if (!fields) {
    return "Please enter Date before splitting this receipt.";
  }
  if (fields.product_date == null || String(fields.product_date).trim() === "") {
    return "Please enter Date before splitting this receipt.";
  }
  if (fields.storeName == null || String(fields.storeName).trim() === "") {
    return "Please enter Merchant before splitting this receipt.";
  }
  if (fields.expense_type == null || String(fields.expense_type).trim() === "") {
    return "Please enter Expense Category before splitting this receipt.";
  }
  const rawTotal = fields.purchasePrice;
  if (rawTotal == null || String(rawTotal).trim() === "") {
    return "Please enter Total before splitting this receipt.";
  }
  const total = parseFloat(String(rawTotal).trim());
  if (!Number.isFinite(total) || total === 0) {
    return "Please enter Total before splitting this receipt.";
  }
  return null;
}

export function getDuplicateReceiptValidationMessage(fields) {
  if (!fields) {
    return "Please enter Date before duplicating this receipt.";
  }
  if (fields.product_date == null || String(fields.product_date).trim() === "") {
    return "Please enter Date before duplicating this receipt.";
  }
  if (fields.storeName == null || String(fields.storeName).trim() === "") {
    return "Please enter Merchant before duplicating this receipt.";
  }
  if (fields.expense_type == null || String(fields.expense_type).trim() === "") {
    return "Please enter Expense Category before duplicating this receipt.";
  }
  const rawTotal = fields.purchasePrice;
  if (rawTotal == null || String(rawTotal).trim() === "") {
    return "Please enter Total before duplicating this receipt.";
  }
  const total = parseFloat(String(rawTotal).trim());
  if (!Number.isFinite(total) || total === 0) {
    return "Please enter Total before duplicating this receipt.";
  }
  return null;
}