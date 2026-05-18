import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

/**
 * Shown when editing a tax type and the rate changes.
 * Go Back | Add New Tax Types | Update Current Rate
 */
export default function TaxRateChangeWarningModal({
  isOpen,
  onClose,
  onGoBack,
  onAddNewTaxType,
  onUpdateCurrentRate,
  isProcessing = false,
  zIndexClass = "z-[80]",
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/60 backdrop-blur-sm p-4`}
          onClick={() => {
            if (!isProcessing) onGoBack();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 pb-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    size={22}
                    className="text-amber-500 flex-shrink-0"
                    aria-hidden
                  />
                  <h3 className="text-lg font-bold text-gray-900">IMPORTANT</h3>
                </div>
                <button
                  type="button"
                  onClick={onGoBack}
                  disabled={isProcessing}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-sm text-gray-700 mb-3">
                Changing the <span className="font-bold">Tax Rate</span> will affect
                your receipt history:
              </p>
              <ul className="text-sm text-gray-700 space-y-2 mb-4 list-disc pl-5">
                <li>
                  <span className="font-bold">Past Receipts:</span> All existing tax
                  amounts will be converted to{" "}
                  <span className="font-bold">Manual Entries</span> to stay unchanged.
                </li>
                <li>
                  <span className="font-bold">Future Receipts:</span> New receipts
                  will automatically use the <span className="font-bold">new rate</span>.
                </li>
              </ul>
              <p className="text-sm text-gray-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                <span className="font-semibold text-gray-800">Best Practice Tip:</span>{" "}
                If this is an official rate change (e.g., VAT 2026), we suggest
                creating a <span className="font-bold">New Tax Type</span> on the
                previous screen. This keeps your records separate and makes your
                reports much clearer!
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 p-4 pt-0 border-t border-gray-100 bg-gray-50/80">
              <button
                type="button"
                onClick={onGoBack}
                disabled={isProcessing}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-500 hover:bg-slate-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={onAddNewTaxType}
                disabled={isProcessing}
                className="flex-1 py-2.5 px-3 rounded-xl bg-white border-2 border-blue-600 text-blue-600 text-sm font-semibold hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                Add New Tax Types
              </button>
              <button
                type="button"
                onClick={onUpdateCurrentRate}
                disabled={isProcessing}
                className="flex-1 py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {isProcessing ? "Updating…" : "Update Current Rate"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
