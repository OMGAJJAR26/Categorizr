/**
 * EditPaymentMethodModal
 * Shared Add / Edit Payment Method modal used by AddReceiptModal and ReceiptDetail.
 *
 * Key fix: "MasterCard" (uppercase C) matches cardTypeIntToBrand from paymentMethodUtils.
 * Legacy stored values like "Mastercard" (lowercase c) still highlight correctly via
 * case-insensitive comparison in isActive().
 */

import React from "react";
import { X, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Payment logo paths (served from /public)
const Visa               = "/payment-logos/Visa.png";
const MasterCard         = "/payment-logos/MasterCard.png";
const PayPal             = "/payment-logos/PayPal.png";
const AmericanExpress    = "/payment-logos/AmericanExpress.webp";
const Discover           = "/payment-logos/discover.png";
const DinersClub         = "/payment-logos/DinersClub.png";
const DebitCard          = "/payment-logos/DebitCard.webp";
const Creditdebitcardicon = "/payment-logos/Creditdebitcardicon.jpg";

/**
 * Canonical card type list — names match CARD_TYPE_INT_TO_BRAND from paymentMethodUtils.
 * Export so callers can build dropdowns or do their own lookups.
 */
export const PAYMENT_CARD_TYPES = [
  { name: "Visa",             logo: Visa },
  { name: "MasterCard",       logo: MasterCard },       // uppercase C — matches cardTypeIntToBrand
  { name: "American Express", logo: AmericanExpress },
  { name: "Discover",         logo: Discover },
  { name: "Diners Club",      logo: DinersClub },
  { name: "PayPal",           logo: PayPal },
  { name: "Debit Card",       logo: DebitCard },
  { name: "Other",            logo: Creditdebitcardicon },
];

/**
 * Resolve a card-type string (possibly from old local storage) to the canonical name
 * in PAYMENT_CARD_TYPES.  Handles legacy "Mastercard" → "MasterCard" etc.
 * Falls back to the raw value when no match is found.
 */
export const resolveCanonicalCardType = (value) => {
  if (!value) return "";
  const lower = value.toLowerCase();
  const match = PAYMENT_CARD_TYPES.find((ct) => ct.name.toLowerCase() === lower);
  return match ? match.name : value;
};

/**
 * Shared Add / Edit Payment Method modal.
 *
 * Props
 * ─────
 * isOpen           boolean
 * isSaving         boolean
 * editMode         null | { name: string, apiId: any }   – null = "Add" mode
 * cardType         string   – currently selected card-type name
 * cardIssuerName   string
 * last4Digits      string   – digits only, max 4
 * categoryType     string   – "" | "Personal" | "Business"
 * duplicateError   string | null | undefined
 * generalError     string | null | undefined
 *
 * onClose          () => void
 * onSave           () => void
 * onCardTypeChange (name: string) => void   – always receives canonical name
 * onIssuerChange   (value: string) => void
 * onLast4Change    (digits: string) => void – pre-stripped to digits, max 4
 * onCategoryChange (value: string) => void
 */
export default function EditPaymentMethodModal({
  isOpen,
  isSaving,
  editMode,
  cardType,
  cardIssuerName,
  last4Digits,
  categoryType,
  duplicateError,
  generalError,
  onClose,
  onSave,
  onCardTypeChange,
  onIssuerChange,
  onLast4Change,
  onCategoryChange,
}) {
  // Case-insensitive so legacy "Mastercard" (lowercase c) still shows the highlight.
  const isActive = (ct) => ct.name.toLowerCase() === (cardType || "").toLowerCase();

  const inputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  // Keep Save enabled for incomplete last4 (Settings parity); validation runs in onSave.
  const saveDisabled = isSaving || !!duplicateError;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="editpaymodal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => { if (!isSaving) onClose(); }}
        >
          <motion.div
            key="editpaymodal-dialog"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Saving overlay */}
            {isSaving && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-10 bg-white/80 flex flex-col items-center justify-center rounded-xl"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mb-3"
                />
                <p className="text-sm text-gray-600 font-medium">Updating payment method…</p>
              </motion.div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
              <h2 className="text-xl font-bold text-gray-900">
                {editMode ? "Edit Payment Method" : "Add Payment Method"}
              </h2>
              <button
                onClick={onClose}
                disabled={isSaving}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">

              {/* ── Card Type Grid ─────────────────────────────────────────── */}
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Payment Card Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                  {PAYMENT_CARD_TYPES.map((ct) => (
                    <div
                      key={ct.name}
                      className={`relative cursor-pointer border-2 rounded-lg transition-all flex flex-col items-center justify-center p-3 min-h-[100px] ${
                        isActive(ct)
                          ? "border-blue-600 ring-2 ring-blue-300 bg-blue-50"
                          : "border-gray-200 hover:border-gray-400"
                      }`}
                      onClick={() => onCardTypeChange(ct.name)}
                    >
                      <div className="flex-shrink-0 mb-2 flex items-center justify-center w-full h-12">
                        <img
                          src={ct.logo}
                          alt={ct.name}
                          className="max-w-full max-h-12 w-auto h-auto object-contain"
                          style={{ imageRendering: "auto" }}
                          onError={(e) => { e.target.style.display = "none"; }}
                        />
                      </div>
                      <span className="text-xs font-medium text-center">{ct.name}</span>
                      {isActive(ct) && (
                        <div className="absolute top-1 right-1 bg-blue-600 rounded-full p-1 z-10">
                          <svg
                            className="w-4 h-4 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Card Issuer & Last 4 Digits ────────────────────────────── */}
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Card Issuer{" "}
                  <span className="font-normal text-gray-500">(optional)</span>
                  {" "}& Last 4 Digits <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    className={inputCls}
                    value={cardIssuerName}
                    onChange={(e) => onIssuerChange(e.target.value)}
                    placeholder="Enter Card Issuer (e.g., SBI)"
                  />
                  <input
                    type="text"
                    className={inputCls}
                    value={last4Digits}
                    onChange={(e) =>
                      onLast4Change(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="0000"
                    maxLength={4}
                  />
                </div>
              </div>

              {/* ── Duplicate error ────────────────────────────────────────── */}
              {!isSaving && duplicateError && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  <AlertCircle size={14} />
                  {duplicateError}
                </div>
              )}

              {/* ── Payment Category ───────────────────────────────────────── */}
              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Payment Category Type
                </label>
                <select
                  className={inputCls}
                  value={categoryType}
                  onChange={(e) => onCategoryChange(e.target.value)}
                >
                  <option value="">Select Category Type</option>
                  <option value="Personal">Personal</option>
                  <option value="Business">Business</option>
                </select>
              </div>

              {/* ── Validation error (e.g. last 4 digits) ─────────────────── */}
              {!isSaving && generalError && (
                <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  <AlertCircle size={14} />
                  {generalError}
                </div>
              )}

              {/* ── Action Buttons ─────────────────────────────────────────── */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saveDisabled}
                  className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving
                    ? "Saving…"
                    : editMode
                      ? "Save"
                      : "Add Payment Method"}
                </button>
              </div>

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
