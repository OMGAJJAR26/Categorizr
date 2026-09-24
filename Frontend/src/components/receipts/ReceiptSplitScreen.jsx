import { ChevronRight, Plus } from "lucide-react";

/**
 * Presentational Split screen shared by the Add-Receipt modal and the
 * Edit-Receipt page. Renders both the split OVERVIEW (Main Receipt card, split
 * rows with a per-field breakdown, remainder row, "Add Split") and the split
 * DETAIL editor (Personal/Business, Category, Receipt Totals, Describe Purchase).
 *
 * All state + field math comes from `useReceiptSplits`; this component holds no
 * business logic and no per-screen save behaviour — it only renders and calls
 * back. The caller supplies a normalized `main` receipt for display.
 *
 * @param {Object}   main               { subtotal, total, tip, taxValues, storeName,
 *   expenseType, receiptCategory, paymentLogo, paymentTitle, thumbnailUrl, dateLabel }
 * @param {Array}    splits
 * @param {number?}  activeSplitIndex   null = overview; N = editing split N
 * @param {Object}   splitErrors        { [split._id]: { amount } }
 * @param {string?}  splitError         screen-level error banner
 * @param {string[]} allExpenseCategories
 * @param {number}   [maxDescriptionLength=100]
 * @param {Function} onUpdateField      (idx, field, value)
 * @param {Function} onAddSplit
 * @param {Function} onRemoveSplit      (idx)
 * @param {Function} onOpenSplit        (idx)
 * @param {Function} onAlert            (message)
 * @param {Function} splitLabel         (idx) => string
 * @param {Function} splitBaseName      () => string
 */
const ReceiptSplitScreen = ({
  main,
  splits,
  activeSplitIndex,
  splitErrors,
  splitError,
  allExpenseCategories,
  maxDescriptionLength = 100,
  onUpdateField,
  onAddSplit,
  onRemoveSplit,
  onOpenSplit,
  onAlert,
  splitLabel,
  splitBaseName,
}) => {
  const AGGREGATE_MSG =
    "Aggregate total of all split totals cannot exceed total of original receipt total.";

  const mainTotal = parseFloat(main?.total) || 0;
  const mainSubtotal = (parseFloat(main?.subtotal) || 0) || mainTotal;
  const mainTip = parseFloat(main?.tip) || 0;
  const hasTip = mainTip > 0;
  const mainTaxList = main?.taxValues || [];

  return (
    <div className="p-4 sm:p-6">
      {activeSplitIndex !== null && splits[activeSplitIndex] ? (
        /* ── Split Detail View ── */
        (() => {
          const split = splits[activeSplitIndex];
          const fieldErr = splitErrors[split._id] || {};
          const hasAmountErr = !!fieldErr.amount;
          // "max" = what's LEFT: main − amounts the OTHER splits already took, per
          // field. Shrinks as splits are added/filled (mirrors the mobile app).
          const otherSplits = splits.filter((_, i) => i !== activeSplitIndex);
          const otherSum = (fn) => otherSplits.reduce((s, sp) => s + (parseFloat(fn(sp)) || 0), 0);
          const remClamp = (v) => Math.max(0, parseFloat(v.toFixed(2)));
          const maxSubtotal = remClamp(mainSubtotal - otherSum((sp) => sp.subtotal));
          const maxTotal = remClamp(mainTotal - otherSum((sp) => sp.purchasePrice));
          const maxTip = remClamp(mainTip - otherSum((sp) => sp.tip));
          const maxTaxAt = (ti) => remClamp(
            (parseFloat(mainTaxList[ti]?.tax_amount) || 0)
            - otherSplits.reduce((s, sp) => s + (parseFloat(sp.receipt_tax_values?.[ti]?.tax_amount) || 0), 0)
          );
          return (
            <div className="space-y-4">
              {/* Personal / Business */}
              <div className="flex justify-center">
                <div className="inline-flex rounded-full overflow-hidden border border-gray-200 bg-gray-100 p-0.5">
                  <button type="button"
                    className={`px-6 py-1.5 text-sm font-semibold rounded-full transition-colors ${parseInt(split.receipt_category) !== 1 ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                    onClick={() => onUpdateField(activeSplitIndex, "receipt_category", 0)}>Personal</button>
                  <button type="button"
                    className={`px-6 py-1.5 text-sm font-semibold rounded-full transition-colors ${parseInt(split.receipt_category) === 1 ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
                    onClick={() => onUpdateField(activeSplitIndex, "receipt_category", 1)}>Business</button>
                </div>
              </div>

              {/* RECEIPT INFORMATION → Category (row: label left, value/select right) */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Receipt Information</p>
                <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-gray-900 flex-shrink-0">Category</span>
                  <select
                    className="text-sm text-right text-gray-800 bg-transparent outline-none max-w-[62%] truncate cursor-pointer"
                    value={split.expense_type || ""}
                    onChange={(e) => onUpdateField(activeSplitIndex, "expense_type", e.target.value)}
                  >
                    <option value="">Select category</option>
                    {allExpenseCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* RECEIPT TOTALS — iOS-style rows: label + (max) on the left, value box on the right */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Receipt Totals</p>
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                  {/* Subtotal (read-only, derived from Total − Tip) */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <span className="text-sm font-bold text-gray-900">
                      Subtotal <span className="font-normal text-gray-400">(max. ${maxSubtotal.toFixed(2)})</span>
                    </span>
                    <span className={`text-sm min-w-[92px] text-right px-2 py-1 rounded-md bg-gray-100 ${parseFloat(split.subtotal) < 0 ? "text-red-600 font-medium" : "text-gray-600"}`}>
                      ${split.subtotal !== "" && split.subtotal != null ? parseFloat(split.subtotal).toFixed(2) : "0.00"}
                    </span>
                  </div>
                  {/* Tax fields */}
                  {(split.receipt_tax_values || []).map((t, ti) => {
                    const maxTax = maxTaxAt(ti);
                    return (
                      <div key={ti} className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <span className="text-sm font-bold text-gray-900">
                          {t.tax_name} ({parseFloat(t.tax_rate) || 0}%) <span className="font-normal text-gray-400">(max. ${maxTax.toFixed(2)})</span>
                        </span>
                        <div className="relative min-w-[92px]">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                          <input type="number"
                            className="w-full text-sm text-right pl-5 pr-2 py-1 rounded-md bg-gray-100 border border-transparent focus:border-blue-400 focus:bg-white text-gray-800 outline-none"
                            value={t.tax_amount ?? ""}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              if (v < 0) return; // no negative tax amounts on a split
                              if (maxTax > 0 && v > maxTax + 0.005) { onAlert?.(AGGREGATE_MSG); return; }
                              const updatedTaxes = split.receipt_tax_values.map((tv, tvi) => tvi === ti ? { ...tv, tax_amount: e.target.value } : tv);
                              onUpdateField(activeSplitIndex, "receipt_tax_values", updatedTaxes);
                            }}
                            placeholder="0.00" min="0" step="0.01" />
                        </div>
                      </div>
                    );
                  })}
                  {/* Tip — only when the original receipt has a tip */}
                  {hasTip && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <span className="text-sm font-bold text-gray-900">
                        TIP <span className="font-normal text-gray-400">(max. ${maxTip.toFixed(2)})</span>
                      </span>
                      <div className="relative min-w-[92px]">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                        <input type="number"
                          className="w-full text-sm text-right pl-5 pr-2 py-1 rounded-md bg-gray-100 border border-transparent focus:border-blue-400 focus:bg-white text-gray-800 outline-none"
                          value={split.tip ?? ""} onChange={(e) => onUpdateField(activeSplitIndex, "tip", e.target.value)}
                          placeholder="0.00" min="0" max={maxTip} step="0.01" />
                      </div>
                    </div>
                  )}
                  {/* Total */}
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <span className={`text-sm font-bold ${hasAmountErr ? "text-red-500" : "text-gray-900"}`}>
                      TOTAL <span className="font-normal text-gray-400">(max. ${maxTotal.toFixed(2)})</span>
                    </span>
                    <div className="relative min-w-[92px]">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                      <input type="number"
                        className={`w-full text-sm text-right font-bold pl-5 pr-2 py-1 rounded-md bg-gray-100 text-gray-900 outline-none border ${hasAmountErr ? "border-red-400 ring-1 ring-red-300" : "border-transparent focus:border-blue-400 focus:bg-white"}`}
                        value={split.purchasePrice ?? ""} onChange={(e) => onUpdateField(activeSplitIndex, "purchasePrice", e.target.value)}
                        placeholder="0.00" min="0" max={maxTotal} step="0.01" />
                    </div>
                  </div>
                </div>
                {hasAmountErr && <p className="mt-1 text-xs text-red-500">{fieldErr.amount}</p>}
              </div>

              {/* MORE INFORMATION → Describe Purchase */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">More Information</p>
                <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
                  <p className="text-sm font-bold text-gray-900 mb-1">Describe Purchase</p>
                  <input type="text"
                    className="w-full text-sm text-gray-800 bg-transparent outline-none placeholder-gray-400"
                    value={split.product_name || ""} onChange={(e) => onUpdateField(activeSplitIndex, "product_name", e.target.value)}
                    maxLength={maxDescriptionLength}
                    placeholder="Enter a description" />
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        /* ── Split Overview ── */
        (() => {
          const splitsTotal = parseFloat(splits.reduce((s, sp) => s + (parseFloat(sp.purchasePrice) || 0), 0).toFixed(2));
          const remainder = parseFloat((mainTotal - splitsTotal).toFixed(2));
          const isOverBudget = remainder < -0.009;
          const storeName = main?.storeName || "—";
          const baseName = splitBaseName();
          const mainType = parseInt(main?.receiptCategory) === 1 ? "Business" : "Personal";
          const mainCategory = (main?.expenseType || "").toString().trim();
          const payLogo = main?.paymentLogo;
          const payTitle = main?.paymentTitle || "";
          const thumbUrl = main?.thumbnailUrl;
          const dateLabel = main?.dateLabel || "—";
          // Remainder breakdown = main − amounts taken by all splits (per field).
          const sumSplits = (fn) => splits.reduce((s, sp) => s + (parseFloat(fn(sp)) || 0), 0);
          const remSubtotal = parseFloat((mainSubtotal - sumSplits((sp) => sp.subtotal)).toFixed(2));
          const remTip = parseFloat((mainTip - sumSplits((sp) => sp.tip)).toFixed(2));
          const remTaxAt = (ti) => parseFloat((
            (parseFloat(mainTaxList[ti]?.tax_amount) || 0)
            - splits.reduce((s, sp) => s + (parseFloat(sp.receipt_tax_values?.[ti]?.tax_amount) || 0), 0)
          ).toFixed(2));

          // One split's / the remainder's totals breakdown table.
          const Breakdown = ({ subtotal, taxAt, tip, total }) => (
            <div className="mt-1">
              {[
                ["Subtotal", subtotal, false],
                ...mainTaxList.map((t, ti) => [`${t.tax_name} (${parseFloat(t.tax_rate) || 0}%)`, taxAt(ti), false]),
                ...(hasTip ? [["TIP", tip, false]] : []),
                ["TOTAL", total, true],
              ].map(([lbl, val, bold], i) => (
                <div key={i} className={`flex items-center justify-between py-1.5 border-b border-gray-100 ${bold ? "font-bold text-gray-900" : ""}`}>
                  <span className={bold ? "text-sm uppercase" : "text-sm text-gray-700"}>{lbl}</span>
                  <span className={`text-sm ${bold ? "text-gray-900" : "text-gray-500"}`}>${(parseFloat(val) || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          );

          return (
            <div className="space-y-4">
              {/* ── Main Receipt ── */}
              <div>
                <p className="text-blue-600 font-bold text-base mb-2">Main Receipt</p>
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" loading="lazy"
                      className="w-12 h-14 object-cover rounded-md border border-gray-200 flex-shrink-0 bg-gray-900" />
                  ) : (
                    <div className="w-12 h-14 rounded-md bg-gray-100 border border-gray-200 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{storeName}</p>
                    {mainCategory && (
                      <p className="text-xs text-gray-600 truncate">{mainCategory}</p>
                    )}
                    <p className="text-xs text-gray-400">{mainType}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900 text-sm">${mainTotal.toFixed(2)}</p>
                    {dateLabel !== "—" && <p className="text-xs text-gray-500">{dateLabel}</p>}
                    {payTitle && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 justify-end mt-0.5">
                        {payLogo && <img src={payLogo} alt="" className="w-6 h-4 object-contain" />}
                        {payTitle}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {isOverBudget && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-medium">
                  ⚠ Splits exceed total by ${Math.abs(remainder).toFixed(2)}
                </div>
              )}

              {/* ── Splits ── */}
              <div>
                <p className="text-blue-600 font-bold text-base mb-2">Splits</p>
                <div className="space-y-3">
                  {/* Added splits — info column (left) + breakdown table (right), iOS-style */}
                  {splits.map((split, idx) => {
                    const hasErr = !!splitErrors[split._id];
                    const splitType = parseInt(split.receipt_category) === 1 ? "Business" : "Personal";
                    const splitCat = (split.expense_type || "").toString().trim();
                    return (
                      <div key={split._id}
                        className={`bg-white border rounded-xl overflow-hidden flex ${hasErr ? "border-red-400" : "border-gray-200"}`}>
                        {/* Left: merchant / category / type + remove + open */}
                        <div className="flex items-center gap-2 px-3 py-3 w-2/5 min-w-0 cursor-pointer hover:bg-gray-50"
                          onClick={() => onOpenSplit(idx)}>
                          <button type="button" onClick={(e) => { e.stopPropagation(); onRemoveSplit(idx); }}
                            className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                            title="Remove split">
                            <span className="text-base leading-none font-bold">−</span>
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-900 text-sm truncate">{splitLabel(idx)}</p>
                            {splitCat && <p className="text-xs text-gray-600 truncate">{splitCat}</p>}
                            <p className="text-xs text-gray-400">{splitType}</p>
                            {hasErr && <p className="text-xs text-red-500 font-medium">Tap to fix</p>}
                          </div>
                          <ChevronRight size={18} className="text-blue-500 flex-shrink-0" />
                        </div>
                        {/* Right: totals breakdown */}
                        <div className="flex-1 min-w-0 border-l border-gray-200 px-3 py-1">
                          <Breakdown
                            subtotal={split.subtotal}
                            taxAt={(ti) => split.receipt_tax_values?.[ti]?.tax_amount}
                            tip={split.tip}
                            total={split.purchasePrice}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Remainder (the main receipt) — same two-column layout, no remove/open */}
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex">
                    <div className="flex items-center px-3 py-3 w-2/5 min-w-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-sm truncate">{baseName}</p>
                        {mainCategory && <p className="text-xs text-gray-600 truncate">{mainCategory}</p>}
                        <p className="text-xs text-gray-400">{mainType}</p>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 border-l border-gray-200 px-3 py-1">
                      <Breakdown
                        subtotal={remSubtotal}
                        taxAt={(ti) => remTaxAt(ti)}
                        tip={remTip}
                        total={remainder}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Add Split Button */}
              <button type="button" onClick={onAddSplit}
                className="w-full flex items-center justify-center gap-2 py-3 text-blue-600 font-semibold text-base hover:bg-blue-50 rounded-xl transition-colors">
                <Plus size={20} /> Add Split
              </button>

              {splitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{splitError}</div>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
};

export default ReceiptSplitScreen;
