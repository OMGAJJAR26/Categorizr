import { collectReceiptMediaUrls, isPdfUrl } from "./mediaUrlUtils";

/** True when any receipt filter or search term is active. */
export function hasActiveReceiptFilters(filters, searchTerm) {
  if (searchTerm?.trim()) return true;
  if (!filters) return false;
  return !!(
    filters.price ||
    filters.date ||
    (filters.merchant?.length > 0) ||
    (filters.expenseCategory?.length > 0) ||
    (filters.receiptCategory?.length > 0) ||
    (filters.paymentMethod?.length > 0) ||
    (filters.taxTypes?.length > 0) ||
    (filters.tags?.length > 0)
  );
}

/**
 * Flatten receipts into gallery items (one per image).
 * Receipt order is kept as given so the gallery matches the main screen
 * (date, then total, then Describe Purchase, then merchant).
 * Multiple images on one receipt keep their field order.
 */
export function buildReceiptGalleryItems(receipts) {
  if (!Array.isArray(receipts)) return [];

  const items = [];
  receipts.forEach((receipt) => {
    if (!receipt) return;
    const urls = collectReceiptMediaUrls(receipt);
    urls.forEach((url, imageIndex) => {
      items.push({
        id: `${receipt.id}-${imageIndex}`,
        receiptId: receipt.id,
        imageIndex,
        url,
        isPdf: isPdfUrl(url),
        productDate: Number(receipt.product_date) || 0,
        storeName: receipt.storeName || "",
        purchasePrice: receipt.purchasePrice,
        receipt,
      });
    });
  });

  return items;
}
