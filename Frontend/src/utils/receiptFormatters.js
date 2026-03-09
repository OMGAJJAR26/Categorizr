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

export const toTaxLabel = (tax) => {
  const name = tax?.tax_name?.toString().trim() || "Unknown";
  if (name.toLowerCase().startsWith("tip")) return "Tip";
  const val = tax?.tax_rate != null 
    ? parseFloat(String(tax.tax_rate).replace(/%/g, "")) 
    : 0;
  const rounded = Math.round(isNaN(val) ? 0 : val);
  return `${name} | ${rounded}%`;
};