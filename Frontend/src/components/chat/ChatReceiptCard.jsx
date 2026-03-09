import { motion } from "framer-motion";
import { Receipt, Calendar, Store, CreditCard } from "lucide-react";

/**
 * Mini receipt card for displaying in chat responses
 * Clickable to open receipt detail
 */
const ChatReceiptCard = ({ receipt, onClick }) => {
  const formatDate = (timestamp) => {
    if (!timestamp || timestamp === "0" || timestamp === 0) return "—";
    const ts = Number(timestamp);
    // Check if timestamp is valid (not 0 and not in the past before 2000)
    if (isNaN(ts) || ts < 946684800) return "—"; // 946684800 = Jan 1, 2000
    const date = new Date(ts * 1000);
    // Check if date is valid
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatCurrency = (amount) => {
    const num = parseFloat(amount) || 0;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(num);
  };

  // Helper to check if value is valid (not empty, "0", etc.)
  const isValidValue = (val) => {
    if (!val) return false;
    const str = String(val).trim();
    return str !== "" && str !== "0" && str !== "null" && str !== "undefined";
  };

  // Get store name with proper fallback
  const getStoreName = () => {
    if (isValidValue(receipt.storeName)) return receipt.storeName;
    if (isValidValue(receipt.merchant)) return receipt.merchant;
    if (isValidValue(receipt.product_name)) return receipt.product_name;
    return null;
  };

  const storeName = getStoreName();
  const price = parseFloat(receipt.purchasePrice) || 0;

  // Don't render if receipt has no valid store name AND no valid price
  if (!storeName && price === 0) {
    return null;
  }

  return (
    <motion.button
      onClick={onClick}
      className="w-full text-left bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-blue-300 transition-all duration-200"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="flex justify-between items-start gap-2">
        {/* Left side: Store and details */}
        <div className="flex-1 min-w-0">
          {/* Store name */}
          <div className="flex items-center gap-1.5 mb-1">
            <Store size={12} className="text-gray-400 flex-shrink-0" />
            <p className="font-medium text-sm text-gray-900 truncate">
              {storeName || "Receipt"}
            </p>
          </div>

          {/* Date and category */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {formatDate(receipt.product_date) !== "—" && (
              <span className="flex items-center gap-1">
                <Calendar size={10} />
                {formatDate(receipt.product_date)}
              </span>
            )}
            {receipt.expense_type && receipt.expense_type !== "0" && (
              <span className="truncate">{receipt.expense_type}</span>
            )}
          </div>

          {/* Payment method */}
          {(() => {
            const payment = receipt.card_issuer_name || receipt.paymentType;
            // Filter out invalid payment values
            if (!payment || payment === "0" || payment === "0*0" || /^0\*\d*$/.test(payment)) {
              return null;
            }
            return (
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                <CreditCard size={10} />
                <span className="truncate">{payment}</span>
              </div>
            );
          })()}
        </div>

        {/* Right side: Amount */}
        <div className="text-right flex-shrink-0">
          <p
            className={`font-bold text-sm ${
              parseFloat(receipt.purchasePrice) < 0
                ? "text-red-600"
                : "text-green-600"
            }`}
          >
            {formatCurrency(receipt.purchasePrice)}
          </p>
          <p className="text-xs text-gray-400">
            {receipt.receipt_category == 0 ? "Personal" : "Business"}
          </p>
        </div>
      </div>

      {/* Product name if available */}
      {receipt.product_name && receipt.product_name !== "0" && receipt.product_name !== receipt.storeName && (
        <p className="text-xs text-gray-500 mt-2 truncate border-t pt-2">
          {receipt.product_name}
        </p>
      )}
    </motion.button>
  );
};

export default ChatReceiptCard;
