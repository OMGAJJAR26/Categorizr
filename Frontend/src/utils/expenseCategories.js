/** Fallback suggestions when the user has no API or receipt categories yet. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Restaurants",
  "Fuel",
  "General Retail",
  "Groceries",
  "Travel",
  "Entertainment",
  "Utilities",
  "Healthcare",
  "Education",
  "Office Supplies",
  "Transportation",
  "Insurance",
  "Subscriptions",
  "Personal Care",
  "Home Improvement",
  "Clothing",
  "Electronics",
  "Gifts",
  "Donations",
  "Professional Services",
  "Other",
];

/** Normalize GET /userexpensecategory/getExpenseCategoryv1 payloads to an array. */
export function parseExpenseCategoryApiResponse(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.expense_categories)) return data.expense_categories;
  if (Array.isArray(data?.categories)) return data.categories;
  if (Array.isArray(data?.result)) return data.result;
  return [];
}

export function isValidExpenseCategory(category) {
  if (!category) return false;
  const val = category.toString().trim();
  if (/^\d+$/.test(val)) return false;
  if (val.length < 2) return false;
  if (/^[\d\W]+$/.test(val)) return false;
  if (/^\d+[a-zA-Z]?(-\d+)?$/.test(val)) return false;
  return true;
}

export function getExpenseCategoryNamesFromApi(apiExpenseCategories = []) {
  return (apiExpenseCategories || [])
    .map((c) => (c?.expense_category_name ?? c?.name ?? "").toString().trim())
    .filter(isValidExpenseCategory);
}

/**
 * Build a sorted, deduplicated expense category list for dropdowns and filters.
 * API categories are listed first, then receipt/custom names not already present.
 */
export function buildExpenseCategoryOptions({
  apiExpenseCategories = [],
  receiptCategories = [],
  includeDefaultsWhenEmpty = true,
} = {}) {
  const seen = new Set();
  const result = [];

  const push = (name) => {
    const trimmed = (name || "").toString().trim();
    if (!isValidExpenseCategory(trimmed)) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  };

  getExpenseCategoryNamesFromApi(apiExpenseCategories).forEach(push);
  (receiptCategories || []).forEach(push);

  if (includeDefaultsWhenEmpty && result.length === 0) {
    DEFAULT_EXPENSE_CATEGORIES.forEach(push);
  }

  return result.sort((a, b) => a.localeCompare(b));
}
