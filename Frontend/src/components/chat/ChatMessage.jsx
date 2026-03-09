import { motion } from "framer-motion";
import { User, Sparkles } from "lucide-react";
import ChatReceiptCard from "./ChatReceiptCard";

/**
 * Individual chat message component
 * Supports user and assistant messages with different styling
 */
const ChatMessage = ({ message, onReceiptClick }) => {
  const isUser = message.role === "user";
  const isError = message.type === "error";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-blue-600" : "bg-gray-200"
        }`}
      >
        {isUser ? (
          <User size={16} className="text-white" />
        ) : (
          <Sparkles size={16} className="text-blue-600" />
        )}
      </div>

      {/* Message content */}
      <div
        className={`max-w-[80%] ${isUser ? "text-right" : "text-left"}`}
      >
        <div
          className={`inline-block px-4 py-2 rounded-2xl ${
            isUser
              ? "bg-blue-600 text-white rounded-tr-sm"
              : isError
              ? "bg-red-50 text-red-700 border border-red-200 rounded-tl-sm"
              : "bg-gray-100 text-gray-800 rounded-tl-sm"
          }`}
        >
          {/* Main message text */}
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>

          {/* Summary data (if present) */}
          {message.data && message.type === "summary" && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {message.data.total !== undefined && (
                  <div className="bg-white/50 rounded p-2">
                    <span className="text-gray-500 block">Total</span>
                    <span className="font-bold text-green-600">
                      ${message.data.total.toFixed(2)}
                    </span>
                  </div>
                )}
                {message.data.count !== undefined && (
                  <div className="bg-white/50 rounded p-2">
                    <span className="text-gray-500 block">Transactions</span>
                    <span className="font-bold">{message.data.count}</span>
                  </div>
                )}
                {message.data.average !== undefined && (
                  <div className="bg-white/50 rounded p-2">
                    <span className="text-gray-500 block">Average</span>
                    <span className="font-bold">
                      ${message.data.average.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Category breakdown (if present) */}
          {message.data && message.type === "breakdown" && message.data.items && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="space-y-2">
                {message.data.items.slice(0, 5).map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center text-xs bg-white/50 rounded px-2 py-1"
                  >
                    <span className="truncate mr-2">{item.name}</span>
                    <span className="font-bold whitespace-nowrap">
                      ${item.total.toFixed(2)}
                    </span>
                  </div>
                ))}
                {message.data.items.length > 5 && (
                  <p className="text-xs text-gray-500 text-center">
                    +{message.data.items.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Receipt cards (if present) */}
        {message.data && message.data.receipts && message.data.receipts.length > 0 && (() => {
          // Filter to only valid receipts (have store name or non-zero price)
          const validReceipts = message.data.receipts.filter((r) => {
            const hasValidName = r.storeName && r.storeName !== "0" && r.storeName.trim() !== "";
            const hasValidPrice = parseFloat(r.purchasePrice) !== 0;
            return hasValidName || hasValidPrice;
          });

          if (validReceipts.length === 0) return null;

          return (
            <div className="mt-2 space-y-2">
              {validReceipts.slice(0, 5).map((receipt) => (
                <ChatReceiptCard
                  key={receipt.id}
                  receipt={receipt}
                  onClick={() => onReceiptClick && onReceiptClick(receipt)}
                />
              ))}
              {validReceipts.length > 5 && (
                <p className="text-xs text-gray-500 text-center py-1">
                  +{validReceipts.length - 5} more receipts
                </p>
              )}
            </div>
          );
        })()}

        {/* Suggestions (if present) */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => message.onSuggestionClick && message.onSuggestionClick(suggestion)}
                className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p className="text-xs text-gray-400 mt-1">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </motion.div>
  );
};

export default ChatMessage;
