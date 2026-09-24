import { useRef, useState } from "react";
import { filterNonTipReceiptTaxValues } from "../utils/taxTypeUtils";

/**
 * Shared state + field math for the receipt Split screens.
 *
 * Both the Add-Receipt modal and the Edit-Receipt page split a receipt into
 * children the exact same way, so the interactive math lives here once:
 *   - state: splits, activeSplitIndex, splitErrors, isSavingSplits
 *   - createSplit / addSplit / removeSplit
 *   - updateSplitField (total→subtotal→taxes, tip keeps total fixed, per-field caps)
 *   - splitBaseName / splitLabel
 *
 * The SAVE step differs per screen (Add creates every receipt new; Edit updates
 * the original as the remainder and creates children), so `handleSaveSplits`
 * stays in each caller — this hook deliberately owns none of it.
 *
 * @param {Object} main  normalized main receipt (recomputed by the caller each
 *   render): { subtotal:Number, total:Number, tip:Number, taxValues:Array,
 *   receiptCategory:0|1, expenseType:String, storeName:String }
 * @param {Object} [opts] { onAlert(message:string), maxDescriptionLength=100 }
 */
export function useReceiptSplits(main, opts = {}) {
  const { maxDescriptionLength = 100 } = opts;

  // Keep the latest main receipt + alert handler in refs so the callbacks below
  // always read fresh values without being re-memoized on every keystroke.
  const mainRef = useRef(main);
  mainRef.current = main;
  const onAlertRef = useRef(opts.onAlert);
  onAlertRef.current = opts.onAlert;
  const emitAlert = (message) => onAlertRef.current?.(message);

  const AGGREGATE_MSG =
    "Aggregate total of all split totals cannot exceed total of original receipt total.";

  const [splits, setSplits] = useState([]);
  const [activeSplitIndex, setActiveSplitIndex] = useState(null); // null=overview, N=editing split N
  const [splitErrors, setSplitErrors] = useState({}); // { [split._id]: { amount: "msg" } }
  const [isSavingSplits, setIsSavingSplits] = useState(false);

  const sanitizeMoneyInput = (raw) => {
    if (raw === null || raw === undefined) return "";
    const str = String(raw);
    // Preserve a leading minus so the +/- sign toggle can produce negative amounts.
    const isNeg = str.trim().startsWith("-");
    const cleaned = str.replace(/[^0-9.]/g, "");
    if (!cleaned) return "";
    const [intPartRaw = "", decRaw = ""] = cleaned.split(".");
    const intPart = intPartRaw.replace(/^0+(?=\d)/, "") || (intPartRaw ? "0" : "");
    const decPart = (decRaw || "").slice(0, 2);
    const body = cleaned.includes(".") ? `${intPart || "0"}.${decPart}` : intPart;
    return isNeg && parseFloat(body) !== 0 ? `-${body}` : body;
  };

  /** Base label for splits: the receipt's merchant name. */
  const splitBaseName = () =>
    (mainRef.current?.storeName || "Receipt").toString().trim();
  /** Display label for a split row by index (the remainder is the main receipt). */
  const splitLabel = (idx) => `${splitBaseName()} (${idx + 2})`;

  /** A fresh, empty split seeded from the main receipt's tax lines + defaults. */
  const createSplit = () => {
    const m = mainRef.current || {};
    // Tip is tracked separately; never carry a tip line into a split's tax list.
    const mainTaxes = filterNonTipReceiptTaxValues(m.taxValues || []);
    return {
      _id: Date.now() + Math.random(),
      receipt_category: m.receiptCategory ?? 0,
      expense_type: m.expenseType || "",
      subtotal: "",
      tip: "",
      purchasePrice: "",
      product_name: "",
      receipt_tax_values: mainTaxes.map((t) => ({ ...t, id: 0, tax_amount: "" })),
    };
  };

  /** Add a new blank split and immediately open its detail view. */
  const addSplit = () => {
    const newIdx = splits.length;
    // Default the description to "<Merchant> (N)" (editable), matching mobile.
    const newSlot = { ...createSplit(), product_name: splitLabel(newIdx) };
    setSplits((prev) => [...prev, newSlot]);
    setActiveSplitIndex(newIdx);
  };

  /** Remove a split by index. */
  const removeSplit = (idx) =>
    setSplits((prev) => prev.filter((_, i) => i !== idx));

  /** Clear all splits (used when (re)opening the split screen). */
  const resetSplits = () => {
    setSplits([]);
    setSplitErrors({});
    setActiveSplitIndex(null);
  };

  /**
   * Update a single field on a split. Splits are entered MANUALLY — tax and tip
   * are never auto-calculated; they stay 0 until the user types them:
   *   - purchasePrice (Total) is authoritative; tax + tip are left as-is.
   *   - Subtotal is read-only and always = Total − Σtax − tip.
   *   - tax / tip edits keep the Total fixed and re-derive Subtotal.
   *   - anything else → update in place.
   * Amounts are capped at what's LEFT (main − amounts other splits already took).
   */
  const updateSplitField = (idx, field, value) => {
    if (field === "subtotal" || field === "purchasePrice" || field === "tip") {
      // Splits have no +/- toggle — negative amounts are never valid here, so drop
      // any leading minus (sanitizeMoneyInput keeps it for the main form's refunds).
      value = sanitizeMoneyInput(value).replace(/^-/, "");
    }
    if (field === "product_name") {
      value = (value || "").toString().slice(0, maxDescriptionLength);
    }

    const m = mainRef.current || {};
    const mainSubtotal = (parseFloat(m.subtotal) || 0) || (parseFloat(m.total) || 0);
    const mainTotal = parseFloat(m.total) || 0;
    const mainTip = parseFloat(m.tip) || 0;

    // Cap each field at what's LEFT (main − the amounts other splits already took),
    // so the max shrinks as splits are added — matching the mobile app.
    const others = splits.filter((_, i) => i !== idx);
    const otherSum = (fn) =>
      others.reduce((s, sp) => s + (parseFloat(fn(sp)) || 0), 0);
    const remSubtotal = parseFloat((mainSubtotal - otherSum((sp) => sp.subtotal)).toFixed(2));
    const remTotal = parseFloat((mainTotal - otherSum((sp) => sp.purchasePrice)).toFixed(2));
    const remTip = parseFloat((mainTip - otherSum((sp) => sp.tip)).toFixed(2));

    if (field === "subtotal" && mainSubtotal > 0 && (parseFloat(value) || 0) > remSubtotal + 0.005) {
      emitAlert(AGGREGATE_MSG);
      return;
    }
    if (field === "purchasePrice" && mainTotal > 0 && (parseFloat(value) || 0) > remTotal + 0.005) {
      emitAlert(AGGREGATE_MSG);
      return;
    }
    if (field === "tip" && mainTip > 0 && (parseFloat(value) || 0) > remTip + 0.005) {
      emitAlert(AGGREGATE_MSG);
      return;
    }

    setSplits((prev) => {
      const updated = [...prev];
      const split = updated[idx];
      const sumTax = (arr) => (arr || []).reduce((s, t) => s + (parseFloat(t.tax_amount) || 0), 0);

      if (field === "purchasePrice") {
        // Total is authoritative. Tax + tip are left exactly as the user set them
        // (never auto-derived). Subtotal (read-only) = Total − Σtax − tip.
        const totalNum = parseFloat(value) || 0;
        if (totalNum > 0) {
          const tipNum = parseFloat(split.tip) || 0;
          const sub = parseFloat((totalNum - sumTax(split.receipt_tax_values) - tipNum).toFixed(2));
          updated[idx] = { ...split, purchasePrice: value, subtotal: sub.toString() };
        } else {
          updated[idx] = { ...split, purchasePrice: value, subtotal: "" };
        }
      } else if (field === "tip") {
        // Manual tip. Total stays fixed; re-derive Subtotal = Total − Σtax − tip.
        const totalNum = parseFloat(split.purchasePrice) || 0;
        const tipNum = parseFloat(value) || 0;
        const sub = totalNum > 0 ? parseFloat((totalNum - sumTax(split.receipt_tax_values) - tipNum).toFixed(2)) : 0;
        updated[idx] = { ...split, tip: value, subtotal: totalNum > 0 ? sub.toString() : "" };
      } else if (field === "receipt_tax_values") {
        // Manual tax. Total stays fixed; re-derive Subtotal = Total − Σtax − tip.
        const totalNum = parseFloat(split.purchasePrice) || 0;
        const tipNum = parseFloat(split.tip) || 0;
        const sub = totalNum > 0 ? parseFloat((totalNum - sumTax(value) - tipNum).toFixed(2)) : 0;
        updated[idx] = { ...split, receipt_tax_values: value, subtotal: totalNum > 0 ? sub.toString() : "" };
      } else if (field === "subtotal") {
        // Subtotal is read-only in the UI; keep a sane inverse just in case:
        // Total = Subtotal + Σtax + tip.
        const sub = parseFloat(value) || 0;
        const tipNum = parseFloat(split.tip) || 0;
        const total = sub + sumTax(split.receipt_tax_values) + tipNum;
        updated[idx] = { ...split, subtotal: value, purchasePrice: sub > 0 ? parseFloat(total.toFixed(2)) : "" };
      } else {
        updated[idx] = { ...split, [field]: value };
      }
      return updated;
    });

    // Clear the amount error once the user starts filling in a value.
    if ((field === "subtotal" || field === "purchasePrice") && splits[idx]) {
      const id = splits[idx]._id;
      if (splitErrors[id]?.amount) {
        setSplitErrors((prev) => {
          const n = { ...prev };
          delete n[id];
          return n;
        });
      }
    }
  };

  return {
    splits,
    setSplits,
    activeSplitIndex,
    setActiveSplitIndex,
    splitErrors,
    setSplitErrors,
    isSavingSplits,
    setIsSavingSplits,
    createSplit,
    addSplit,
    removeSplit,
    resetSplits,
    updateSplitField,
    splitBaseName,
    splitLabel,
  };
}
