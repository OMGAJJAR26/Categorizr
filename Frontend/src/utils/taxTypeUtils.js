import { formatTaxRate } from "./receiptFormatters";

export const normalizeTaxNameKey = (name) =>
  (name || "").toString().trim().toLowerCase();

/**
 * Turn OCR-detected tax lines (name + rate + amount) into receipt tax-value entries,
 * matched against the account's tax types BY NAME.
 *
 * - Same name AND same rate → reuse the existing tax type (no account change).
 * - Same name, different rate → a new tax type (flagged _ocrNew) — per product decision
 *   we ADD a separate variant rather than editing the existing rate.
 * - New name → a new tax type (flagged _ocrNew).
 *
 * Every entry is flagged _ocrDetected so the UI can show a "from receipt" note, and the
 * amount is kept as the scanned value (_isManual) so the subtotal reflects the receipt.
 * Capped at 2 (the receipt UI shows two tax lines).
 *
 * @param {Array<{name:string, rate:number|null, amount:number}>} detectedTaxes
 * @param {Array} accountTaxTypes - taxData records ({ id, tax_name, tax_rate })
 */
export function resolveOcrDetectedTaxes(detectedTaxes, accountTaxTypes = []) {
  const nameKey = (s) => String(s || "").trim().toLowerCase();
  const ratesMatch = (a, b) =>
    Math.abs((parseFloat(a) || 0) - (parseFloat(b) || 0)) < 0.01;

  return (detectedTaxes || [])
    .filter((d) => d && d.name && parseFloat(d.amount) > 0)
    .slice(0, 2)
    .map((d) => {
      const rate = d.rate != null ? parseFloat(d.rate) : 0;
      const amount = parseFloat(d.amount).toFixed(2);
      const sameName = (accountTaxTypes || []).filter(
        (t) => nameKey(t.tax_name) === nameKey(d.name)
      );
      const exact = sameName.find((t) => ratesMatch(t.tax_rate, rate));
      if (exact) {
        return {
          fk_tax_id: exact.id,
          tax_name: exact.tax_name,
          tax_rate: String(exact.tax_rate ?? rate),
          tax_amount: amount,
          _isManual: true,
          _ocrDetected: true,
          _ocrNew: false,
        };
      }
      return {
        fk_tax_id: 0,
        tax_name: d.name,
        tax_rate: String(rate),
        tax_amount: amount,
        _isManual: true,
        _ocrDetected: true,
        _ocrNew: true,
      };
    });
}

export const isTipTax = (tax) =>
  (tax?.tax_name || "").toString().toLowerCase().includes("tip");

/** User-defined Tip tax type from Settings (is_tips) or name containing "tip". */
export function findTipTaxDefinition(taxDefinitions) {
  if (!Array.isArray(taxDefinitions)) return null;
  return (
    taxDefinitions.find(
      (t) =>
        parseInt(t?.is_tips, 10) === 1 || isTipTax(t),
    ) || null
  );
}

export function filterNonTipReceiptTaxValues(taxValues) {
  return (taxValues || []).filter((t) => !isTipTax(t));
}

export function findTipLineInReceiptTaxValues(taxValues) {
  return (taxValues || []).find(isTipTax) || null;
}

/**
 * Build a receipt_tax_values line for tip so the API/mobile persist it like other taxes.
 */
export function buildReceiptTipTaxEntry({
  tipAmount,
  subtotal = 0,
  taxDefinitions = [],
  existingTipLine = null,
  fk_receipt_id = 0,
  fk_user_id = 0,
}) {
  const amount = parseFloat(tipAmount) || 0;
  if (amount <= 0) return null;

  const tipPercentage =
    subtotal > 0 ? Math.round((amount / subtotal) * 100) : 0;
  const baseTipTax = findTipTaxDefinition(taxDefinitions);

  return {
    id: parseInt(existingTipLine?.id, 10) || 0,
    fk_user_id:
      parseInt(existingTipLine?.fk_user_id, 10) ||
      parseInt(fk_user_id, 10) ||
      0,
    fk_receipt_id:
      parseInt(fk_receipt_id, 10) ||
      parseInt(existingTipLine?.fk_receipt_id, 10) ||
      0,
    fk_tax_id: baseTipTax
      ? parseInt(baseTipTax.id, 10) || 0
      : parseInt(existingTipLine?.fk_tax_id, 10) || 0,
    tax_name: (baseTipTax?.tax_name || existingTipLine?.tax_name || "Tip").toString(),
    tax_rate: tipPercentage.toString(),
    tax_amount: amount.toFixed(2),
    created: parseInt(existingTipLine?.created, 10) || 0,
    updated: parseInt(existingTipLine?.updated, 10) || 0,
  };
}

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
 * Prefers stored line rate, then rate inferred from stored amount.
 * Definition rate is only used for new lines without a stored amount.
 */
export function resolveReceiptTaxLineRate(tax, taxDefinition, subtotal = 0) {
  const direct = parseFloat(formatTaxRate(tax?.tax_rate));
  if (!isNaN(direct) && direct > 0) return formatTaxRate(direct);

  if (hasStoredTaxAmount(tax)) {
    if (subtotal > 0) {
      const inferred = inferTaxRateFromAmount(tax.tax_amount, subtotal);
      if (inferred && parseFloat(inferred) > 0) return inferred;
    }
    return tax?.tax_rate || "0";
  }

  if (taxDefinition) {
    const defRate = parseFloat(formatTaxRate(taxDefinition.tax_rate));
    if (!isNaN(defRate) && defRate > 0) return formatTaxRate(defRate);
  }

  return tax?.tax_rate || "0";
}

/** Label text for a receipt tax line — uses current tax definition rate when linked by fk_tax_id. */
export function getReceiptTaxLineDisplay(taxLine, taxDefinitions) {
  const taxId = parseInt(taxLine?.fk_tax_id) || 0;
  const def =
    taxId > 0
      ? (taxDefinitions || []).find((t) => parseInt(t.id) === taxId)
      : null;
  return {
    tax_name: def?.tax_name || taxLine?.tax_name || "Tax",
    tax_rate: formatTaxRate(def?.tax_rate ?? taxLine?.tax_rate ?? "0"),
  };
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
  taxName = "",
) {
  const idStr = taxId != null ? String(taxId) : "";
  const nameKey = normalizeTaxNameKey(taxName);
  const frozenRate = formatTaxRate(oldRate);
  return (receiptTaxValues || []).map((t) => {
    const matchById = idStr && String(t?.fk_tax_id || "") === idStr;
    const matchByName = nameKey && normalizeTaxNameKey(t?.tax_name) === nameKey;
    if (matchById || matchByName) {
      const storedAmount = parseFloat(t?.tax_amount);
      let rateToFreeze = frozenRate || t.tax_rate || "0";
      if (subtotal > 0 && !isNaN(storedAmount) && storedAmount > 0) {
        const inferred = inferTaxRateFromAmount(storedAmount, subtotal);
        if (inferred) rateToFreeze = inferred;
      } else if (t.tax_rate) {
        rateToFreeze = formatTaxRate(t.tax_rate);
      }
      return {
        ...t,
        fk_tax_id: t.fk_tax_id || (taxId != null ? taxId : t.fk_tax_id),
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
  oldName,
  updateReceipt,
}) {
  const matching = getReceiptsUsingTax(receipts, taxId, oldName);
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
          oldName,
        ),
      });
    }),
  );
}
