import { formatTaxRate } from "./receiptFormatters";

export const normalizeTaxNameKey = (name) =>
  (name || "").toString().trim().toLowerCase();

const isTipTax = (tax) =>
  (tax?.tax_name || "").toString().toLowerCase().includes("tip");

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

export function hasStoredTaxAmount(tax) {
  const amount = parseFloat(tax?.tax_amount);
  return !isNaN(amount) && amount > 0;
}

export function inferTaxRateFromAmount(taxAmount, subtotal) {
  const amount = parseFloat(taxAmount) || 0;
  const base = parseFloat(subtotal) || 0;
  if (base <= 0 || amount <= 0) return null;
  return formatTaxRate((amount / base) * 100);
}

export function inferReceiptSubtotal(receipt) {
  const storedSubtotal = parseFloat(receipt?.subtotal);
  if (storedSubtotal > 0) return storedSubtotal;

  const total = parseFloat(receipt?.purchasePrice) || 0;
  const taxes = receipt?.receipt_tax_values || [];
  const tipEntry = taxes.find(isTipTax);
  const tip = tipEntry
    ? parseFloat(tipEntry.tax_amount) || 0
    : parseFloat(receipt?.tip) || 0;
  const totalTax = taxes
    .filter((t) => !isTipTax(t))
    .reduce((sum, t) => sum + (parseFloat(t.tax_amount) || 0), 0);

  if (total > 0) return Math.max(total - totalTax - tip, 0);
  return 0;
}

/**
 * Resolve the effective rate for a receipt tax line.
 * Prefers stored line rate, then rate inferred from stored amount, then definition rate.
 */
export function resolveReceiptTaxLineRate(tax, taxDefinition, subtotal = 0) {
  const direct = parseFloat(formatTaxRate(tax?.tax_rate));
  if (!isNaN(direct) && direct > 0) return formatTaxRate(direct);

  if (hasStoredTaxAmount(tax) && subtotal > 0) {
    const inferred = inferTaxRateFromAmount(tax.tax_amount, subtotal);
    if (inferred && parseFloat(inferred) > 0) return inferred;
  }

  if (taxDefinition) {
    const defRate = parseFloat(formatTaxRate(taxDefinition.tax_rate));
    if (!isNaN(defRate) && defRate > 0) return formatTaxRate(defRate);
  }

  return tax?.tax_rate || "0";
}

/** Enrich receipt tax lines without overwriting stored amounts or effective rates. */
export function enrichReceiptTaxValues(receiptTaxValues, taxDefinitions, receipt = {}) {
  const subtotal = inferReceiptSubtotal(receipt);

  return (receiptTaxValues || []).map((tax) => {
    const taxId = parseInt(tax.fk_tax_id) || 0;
    const taxDefinition =
      taxId > 0
        ? (taxDefinitions || []).find((t) => parseInt(t.id) === taxId)
        : null;

    const resolvedRate = resolveReceiptTaxLineRate(tax, taxDefinition, subtotal);

    return {
      ...tax,
      fk_tax_id: taxId || tax.fk_tax_id || 0,
      tax_name: tax.tax_name || taxDefinition?.tax_name || (isTipTax(tax) ? "Tip" : "Tax"),
      tax_rate: resolvedRate,
      tax_number: tax.tax_number || taxDefinition?.tax_number || "",
      tax_amount: tax.tax_amount,
    };
  });
}

/**
 * Keep stored tax amounts when every non-tip line already has an amount.
 * Returns null when rate-based recalculation should run instead.
 */
export function preserveStoredReceiptTaxTotals(receiptTotal, taxValues, tip) {
  const totalNum = parseFloat(receiptTotal) || 0;
  const tipNum = parseFloat(tip) || 0;
  const taxes = (taxValues || []).filter((t) => !isTipTax(t));

  if (taxes.length === 0) return null;
  if (!taxes.every(hasStoredTaxAmount)) return null;

  const totalTax = taxes.reduce(
    (sum, t) => sum + (parseFloat(t.tax_amount) || 0),
    0,
  );
  const subtotal = Math.max(totalNum - totalTax - tipNum, 0);

  const receipt_tax_values = taxes.map((t) => ({
    ...t,
    tax_rate: resolveReceiptTaxLineRate(t, null, subtotal),
    tax_amount: parseFloat(t.tax_amount).toFixed(2),
  }));

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    receipt_tax_values,
  };
}

/** Freeze line-item rate and amount so values stay fixed after a tax-definition rate change. */
export function convertReceiptTaxesToManualEntries(
  receiptTaxValues,
  taxId,
  oldRate,
  subtotal = 0,
) {
  const idStr = taxId != null ? String(taxId) : "";
  const frozenRate = formatTaxRate(oldRate);
  return (receiptTaxValues || []).map((t) => {
    if (idStr && String(t?.fk_tax_id || "") === idStr) {
      const storedAmount = parseFloat(t?.tax_amount);
      let rateToFreeze = frozenRate || t.tax_rate || "0";
      if (subtotal > 0 && !isNaN(storedAmount) && storedAmount > 0) {
        const inferred = inferTaxRateFromAmount(storedAmount, subtotal);
        if (inferred) rateToFreeze = inferred;
      }
      return {
        ...t,
        tax_rate: rateToFreeze,
        tax_amount: hasStoredTaxAmount(t)
          ? parseFloat(storedAmount).toFixed(2)
          : t.tax_amount ?? "0",
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
    matching.map((r) => {
      const subtotal = inferReceiptSubtotal(r);
      return updateReceipt(r.id, {
        receipt_tax_values: convertReceiptTaxesToManualEntries(
          r.receipt_tax_values,
          taxId,
          oldRate,
          subtotal,
        ),
      });
    }),
  );
}
