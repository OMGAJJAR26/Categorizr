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

const EXPENSE_CATEGORY_NAME_FIELDS = [
  "expense_category_name",
  "Expense_Category_Name",
  "expenseCategoryName",
  "category_name",
  "CategoryName",
  "name",
  "Name",
  "title",
  "label",
];

const EXPENSE_CATEGORY_ID_FIELDS = [
  "id",
  "ID",
  "expense_category_id",
  "Expense_Category_Id",
  "fk_expense_category_id",
  "Fk_Expense_Category_Id",
];

function isExpenseCategoryLikeRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const hasName = EXPENSE_CATEGORY_NAME_FIELDS.some((field) => {
    const trimmed = (value[field] ?? "").toString().trim();
    return trimmed.length > 0;
  });
  const hasId = EXPENSE_CATEGORY_ID_FIELDS.some(
    (field) => value[field] != null && String(value[field]).trim() !== ""
  );
  return hasName || hasId;
}

/** Coerce PHP-style object maps ({ "0": {...}, "1": {...} }) or a single record into an array. */
function coerceExpenseCategoryRecordList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "object") return [];

  if (isExpenseCategoryLikeRecord(value)) return [value];

  const values = Object.values(value).filter(
    (entry) => entry != null && typeof entry === "object"
  );
  if (values.length === 0) return [];

  if (values.every(isExpenseCategoryLikeRecord)) return values;

  // Wrapped payload, e.g. { data: { "0": {...}, "1": {...} } }
  if (values.length === 1) {
    const nested = coerceExpenseCategoryRecordList(values[0]);
    if (nested.length > 0) return nested;
  }

  return values;
}

/** Flatten nested category wrappers returned by some mobile/API payloads. */
function unwrapExpenseCategoryRecord(item) {
  if (item == null) return null;
  if (typeof item !== "object") return item;

  const nested =
    item.expense_category ??
    item.ExpenseCategory ??
    item.expenseCategory ??
    item.category ??
    item.Category ??
    null;

  if (nested && typeof nested === "object" && nested !== item) {
    return { ...item, ...nested };
  }
  return item;
}

/** Normalize GET /userexpensecategory/getExpenseCategoryv1 payloads to an array. */
export function parseExpenseCategoryApiResponse(data) {
  if (!data) return [];

  const candidates = [
    data?.data,
    data?.expense_categories,
    data?.expense_category,
    data?.Expense_Categories,
    data?.categories,
    data?.category,
    data?.result,
    data?.records,
    data?.list,
    data,
  ];

  for (const candidate of candidates) {
    const list = coerceExpenseCategoryRecordList(candidate)
      .map(unwrapExpenseCategoryRecord)
      .filter((item) => item != null);
    if (list.length > 0) return list;
  }

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
  for (const field of EXPENSE_CATEGORY_NAME_FIELDS) {
    const trimmed = (item[field] ?? "").toString().trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export function getExpenseCategoryRecordId(item) {
  if (!item || typeof item !== "object") return null;
  for (const field of EXPENSE_CATEGORY_ID_FIELDS) {
    const raw = item[field];
    if (raw == null || String(raw).trim() === "") continue;
    return raw;
  }
  return null;
}

/** Resolve expense category label from a receipt row (web + mobile + forwarded payloads). */
export function getReceiptExpenseType(receipt, apiExpenseCategories = []) {
  if (!receipt) return "";

  const directCandidates = [
    receipt.expense_type,
    receipt.expenseType,
    receipt.expense_category,
    receipt.expenseCategory,
    receipt.expense_category_name,
    receipt.expenseCategoryName,
  ];
  for (const candidate of directCandidates) {
    const trimmed = (candidate ?? "").toString().trim();
    if (trimmed && trimmed !== "0") return trimmed;
  }

  const nested =
    receipt.expense_category ??
    receipt.expenseCategory ??
    receipt.user_expense_category ??
    receipt.userExpenseCategory ??
    null;
  if (nested && typeof nested === "object") {
    const nestedName = getExpenseCategoryRecordName(nested);
    if (nestedName) return nestedName;
  }

  const catId =
    receipt.fk_expense_category_id ??
    receipt.fkExpenseCategoryId ??
    receipt.expense_category_id ??
    receipt.expenseCategoryId;
  if (catId != null && catId !== "" && catId !== "0" && catId !== 0) {
    const match = (apiExpenseCategories || []).find(
      (c) => String(getExpenseCategoryRecordId(c)) === String(catId)
    );
    const name = getExpenseCategoryRecordName(match);
    if (name) return name;
  }

  return "";
}

/** Normalize add/get expense category API records to a stable shape for Settings lists. */
export function normalizeExpenseCategoryApiItem(item, fallbackName = "") {
  const expense_category_name =
    getExpenseCategoryRecordName(item) || (fallbackName || "").toString().trim();
  if (!expense_category_name || !isValidExpenseCategory(expense_category_name)) return null;
  const id = getExpenseCategoryRecordId(item);
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
