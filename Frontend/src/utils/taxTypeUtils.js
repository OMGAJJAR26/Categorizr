import { formatTaxRate } from "./receiptFormatters";

export const normalizeTaxNameKey = (name) =>
  (name || "").toString().trim().toLowerCase();

/** Next available name like "GST (1)" when base is taken. */
export function buildIncrementedTaxName(baseName, existingNames) {
  const base = (baseName || "").toString().trim();
  if (!base) return "";
  const keys = new Set(
    (existingNames || []).map((n) => normalizeTaxNameKey(n)).filter(Boolean),
  );
  if (!keys.has(normalizeTaxNameKey(base))) return base;

  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${base} (${i})`;
    if (!keys.has(normalizeTaxNameKey(candidate))) return candidate;
  }
  return `${base} (${Date.now()})`;
}

export function receiptUsesTax(receipt, taxId, taxName) {
  const idStr = taxId != null ? String(taxId) : "";
  const nameKey = normalizeTaxNameKey(taxName);
  return (receipt?.receipt_tax_values || []).some((t) => {
    if (idStr && String(t?.fk_tax_id || "") === idStr) return true;
    if (nameKey && normalizeTaxNameKey(t?.tax_name) === nameKey) return true;
    return false;
  });
}

export function getReceiptsUsingTax(receipts, taxId, taxName) {
  return (receipts || []).filter((r) => receiptUsesTax(r, taxId, taxName));
}

export function updateReceiptTaxNames(receiptTaxValues, taxId, oldName, newName) {
  const idStr = taxId != null ? String(taxId) : "";
  const oldKey = normalizeTaxNameKey(oldName);
  return (receiptTaxValues || []).map((t) => {
    const matchById = idStr && String(t?.fk_tax_id || "") === idStr;
    const matchByName = oldKey && normalizeTaxNameKey(t?.tax_name) === oldKey;
    if (matchById || matchByName) {
      return { ...t, tax_name: newName };
    }
    return t;
  });
}

/** Freeze line-item rate so amounts stay fixed after a tax-definition rate change. */
export function convertReceiptTaxesToManualEntries(receiptTaxValues, taxId, oldRate) {
  const idStr = taxId != null ? String(taxId) : "";
  const frozenRate = formatTaxRate(oldRate);
  return (receiptTaxValues || []).map((t) => {
    if (idStr && String(t?.fk_tax_id || "") === idStr) {
      return {
        ...t,
        tax_rate: frozenRate || t.tax_rate || "0",
      };
    }
    return t;
  });
}

export function taxRatesDiffer(a, b) {
  const left = parseFloat(formatTaxRate(a));
  const right = parseFloat(formatTaxRate(b));
  if (isNaN(left) || isNaN(right)) return String(a ?? "") !== String(b ?? "");
  return left !== right;
}

export async function propagateTaxNameChangeToReceipts({
  receipts,
  taxId,
  oldName,
  newName,
  updateReceipt,
}) {
  const matching = getReceiptsUsingTax(receipts, taxId, oldName);
  if (matching.length === 0) return;
  await Promise.all(
    matching.map((r) =>
      updateReceipt(r.id, {
        receipt_tax_values: updateReceiptTaxNames(
          r.receipt_tax_values,
          taxId,
          oldName,
          newName,
        ),
      }),
    ),
  );
}

export async function propagateTaxRateChangeToReceipts({
  receipts,
  taxId,
  oldRate,
  updateReceipt,
}) {
  const matching = getReceiptsUsingTax(receipts, taxId, null);
  if (matching.length === 0) return;
  await Promise.all(
    matching.map((r) =>
      updateReceipt(r.id, {
        receipt_tax_values: convertReceiptTaxesToManualEntries(
          r.receipt_tax_values,
          taxId,
          oldRate,
        ),
      }),
    ),
  );
}
