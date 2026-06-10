import { getPaymentDisplayFromReceipt } from "../hooks/usePaymentDisplay";
import { getExpenseCategoryRecordName } from "./expenseCategories";
import {
  getApiPaymentMethodDisplayName,
  normalizePaymentListLabel,
  normalizePaymentMatchKey,
} from "./paymentMethodUtils";
import { isNetworkReceivedReceipt } from "./networkReceiptUtils";

export const buildHomepageFilterMerchantsWithImages = (
  baseMerchantsWithImages,
  receipts,
  apiMerchants
) => {
  const existing = new Set(
    (baseMerchantsWithImages || [])
      .map((m) => (m?.name || "").trim().toLowerCase())
      .filter(Boolean)
  );
  (apiMerchants || []).forEach((m) => {
    const n = (m?.store_name || "").trim().toLowerCase();
    if (n) existing.add(n);
  });

  const extras = [];
  (receipts || []).filter(isNetworkReceivedReceipt).forEach((r) => {
    const name = (r.storeName || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (existing.has(key)) return;
    extras.push({ name, image: r.store_image || "" });
    existing.add(key);
  });

  return [...(baseMerchantsWithImages || []), ...extras].sort((a, b) =>
    (a?.name || "").toLowerCase().localeCompare((b?.name || "").toLowerCase())
  );
};

export const buildHomepageFilterExpenseCategories = (
  baseCategories,
  receipts,
  apiExpenseCategories
) => {
  const existing = new Set(
    (baseCategories || []).map((c) => String(c).trim().toLowerCase()).filter(Boolean)
  );
  (apiExpenseCategories || []).forEach((c) => {
    const n = getExpenseCategoryRecordName(c);
    if (n) existing.add(n.toLowerCase());
  });

  const extras = [];
  (receipts || []).filter(isNetworkReceivedReceipt).forEach((r) => {
    const cat = (r.expense_type || "").trim();
    if (!cat) return;
    const key = cat.toLowerCase();
    if (existing.has(key)) return;
    extras.push(cat);
    existing.add(key);
  });

  return [...(baseCategories || []), ...extras];
};

export const buildHomepageFilterPaymentMethods = (
  basePaymentMethods,
  receipts,
  apiPaymentMethods,
  isHidden
) => {
  const existing = new Set(
    (basePaymentMethods || [])
      .map((p) => normalizePaymentMatchKey(p))
      .filter(Boolean)
  );
  (apiPaymentMethods || []).forEach((m) => {
    const label = getApiPaymentMethodDisplayName(m);
    if (label) existing.add(normalizePaymentMatchKey(label));
  });

  const extras = [];
  (receipts || []).filter(isNetworkReceivedReceipt).forEach((r) => {
    const display = normalizePaymentListLabel(getPaymentDisplayFromReceipt(r));
    if (!display || display === "-") return;
    const key = normalizePaymentMatchKey(display);
    if (!key || existing.has(key)) return;
    if (isHidden?.(display)) return;
    extras.push(display);
    existing.add(key);
  });

  return [...(basePaymentMethods || []), ...extras].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
};
