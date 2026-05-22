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
  // Only reject truly empty strings — numeric names like "999", "4" are valid
  // user-chosen category names and must not be filtered out.
  return val.length > 0;
}

export function getExpenseCategoryRecordName(item) {
  if (!item) return "";
  if (typeof item === "string") return item.toString().trim();
  return (
    item.expense_category_name ??
    item.name ??
    item.category_name ??
    ""
  ).toString().trim();
}

/** Normalize add/get expense category API records to a stable shape for Settings lists. */
export function normalizeExpenseCategoryApiItem(item, fallbackName = "") {
  const expense_category_name =
    getExpenseCategoryRecordName(item) || (fallbackName || "").toString().trim();
  if (!expense_category_name || !isValidExpenseCategory(expense_category_name)) return null;
  const id =
    item?.id ??
    item?.expense_category_id ??
    item?.fk_expense_category_id ??
    null;
  return typeof item === "object" && item !== null
    ? { ...item, id, expense_category_name }
    : { id, expense_category_name };
}

export function normalizeExpenseCategoryApiList(items = []) {
  return (items || [])
    .map((item) => normalizeExpenseCategoryApiItem(item))
    .filter(Boolean);
}

export function getExpenseCategoryNamesFromApi(apiExpenseCategories = []) {
  return (apiExpenseCategories || [])
    .map((c) => getExpenseCategoryRecordName(c))
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
