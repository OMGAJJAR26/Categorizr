import { useState, useRef, useEffect } from "react";
import { Trash2, Link2, Loader2 } from "lucide-react";
import MerchantAvatar from "../MerchantAvatar";
import ReceiptBadges from "../ReceiptBadges";

const ReceiptsTable = ({
  receipt,
  getPaymentLogo,
  getPaymentDisplay,
  onViewClick,
  onDeleteClick,
  onLinkToQuickBooks,
  quickbooksConnected,
  onLinkToSage,
  onLinkToXero,
  isLinking,
  isLinkingSage,
  isLinkingXero,
  formatCurrency,
  onClearQuickbooksLink,
}) => {
  const [showIntegrateMenu, setShowIntegrateMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!showIntegrateMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowIntegrateMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showIntegrateMenu]);

  const getFormattedDate = () => {
    return receipt.product_date
      ? new Date(Number(receipt.product_date) * 1000).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";
  };

  const getReceiptType = () => {
    return receipt.receipt_category == 0
      ? "Personal"
      : receipt.receipt_category == 1
      ? "Business"
      : "—";
  };

  const getTotalColor = () => {
    return Number(receipt.purchasePrice) < 0 ? "text-red-600" : "text-green-700";
  };

  return (
    <>
      {/* Desktop View - Large screens (lg+) */}
      <div className="hidden lg:grid grid-cols-8 gap-4 items-center border rounded-xl shadow-sm hover:shadow-md hover:bg-gray-50 transition p-3">
        <div className="col-span-8 -mt-1 -mb-1">
          <ReceiptBadges receipt={receipt} />
        </div>

        <div className="text-gray-800 font-medium text-sm xl:text-base">
          {getFormattedDate()}
        </div>

        <div className="font-bold text-gray-900 text-sm xl:text-base">
          {getReceiptType()}
        </div>

        <div className="flex items-center gap-2 text-gray-900 font-semibold">
          <MerchantAvatar
            name={receipt.storeName || receipt.merchant}
            explicitUrl={receipt.store_image}
            storename={receipt.id}
          />
          <span className="text-sm xl:text-base truncate max-w-[120px] xl:max-w-none">{receipt.storeName || receipt.merchant || "—"}</span>
        </div>

        <div className="text-gray-800 font-medium text-sm xl:text-base truncate">
          {receipt.expense_type || "—"}
        </div>

        <div className="text-gray-800 font-medium text-sm xl:text-base truncate">
          {receipt.product_name || "—"}
        </div>

        <div className="flex items-center gap-2 text-gray-900 font-medium">
          {(() => {
            const paymentDisplay = getPaymentDisplay(receipt);
            const hasPayment = paymentDisplay && paymentDisplay !== "-" && paymentDisplay !== "—";
            if (!hasPayment) return null;
            const logo = getPaymentLogo(receipt);
            return (
              <>
                {logo && (
                  <img
                    src={logo}
                    alt="Payment logo"
                    className="w-5 h-5 xl:w-6 xl:h-6 object-contain flex-shrink-0"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                <span className="text-sm xl:text-base truncate">{paymentDisplay}</span>
              </>
            );
          })()}
        </div>

        <div className={`text-right font-bold text-sm xl:text-base ${getTotalColor()}`}>
          {formatCurrency(receipt.purchasePrice || 0)}
        </div>

        <div className="flex items-center justify-center gap-2">
          <button
            onClick={onViewClick}
            className="text-blue-600 font-semibold hover:underline text-sm xl:text-base"
          >
            Edit
          </button>
          {(onLinkToQuickBooks || onLinkToSage || onLinkToXero) && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowIntegrateMenu((prev) => !prev);
                }}
                disabled={isLinking || isLinkingSage || isLinkingXero}
                className="p-1.5 hover:bg-green-50 rounded-full transition-colors group"
                title="Integrate"
              >
                {isLinking || isLinkingSage ? (
                  <Loader2 size={16} className="text-green-500 animate-spin" />
                ) : (
                  <Link2 size={16} className="text-green-500 group-hover:text-green-600" />
                )}
              </button>
              {showIntegrateMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                  {onLinkToQuickBooks && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLinkToQuickBooks();
                        setShowIntegrateMenu(false);
                      }}
                      disabled={isLinking || receipt.quickbooksLinked}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                    >
                      {isLinking && <Loader2 size={14} className="animate-spin text-green-500" />}
                      <span>
                        {receipt.quickbooksLinked
                          ? "QuickBooks (Linked)"
                          : "QuickBooks Online"}
                      </span>
                    </button>
                  )}
                  {receipt.quickbooksLinked && onClearQuickbooksLink && (
                    <>
                      <div className="my-1 border-t border-gray-100" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearQuickbooksLink();
                          setShowIntegrateMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
                      >
                        Mark as not linked to QuickBooks
                      </button>
                    </>
                  )}
                  {onLinkToSage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLinkToSage();
                        setShowIntegrateMenu(false);
                      }}
                      disabled={isLinkingSage}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                    >
                      {isLinkingSage && <Loader2 size={14} className="animate-spin text-green-500" />}
                      <span>Sage</span>
                    </button>
                  )}
                  {onLinkToXero && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onLinkToXero();
                        setShowIntegrateMenu(false);
                      }}
                      disabled={isLinkingXero}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                    >
                      {isLinkingXero && <Loader2 size={14} className="animate-spin text-green-500" />}
                      <span>Xero</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick && onDeleteClick(receipt);
            }}
            className="p-1.5 hover:bg-red-50 rounded-full transition-colors group w-auto pr-6"
            title="Delete receipt"
          >
            <Trash2 size={16} className="text-red-500 group-hover:text-red-600" />
          </button>
        </div>
      </div>

      {/* Tablet View - Medium screens (md to lg) */}
      <div className="hidden md:flex lg:hidden flex-col border rounded-xl shadow-sm hover:shadow-md hover:bg-gray-50 transition p-3">
        <div className="mb-2">
          <ReceiptBadges receipt={receipt} />
        </div>

        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <MerchantAvatar
              name={receipt.storeName || receipt.merchant}
              explicitUrl={receipt.store_image}
              storename={receipt.id}
            />
            <div>
              <div className="font-semibold text-gray-900">{receipt.storeName || receipt.merchant || "—"}</div>
              <div className="text-sm text-gray-600">{getFormattedDate()}</div>
            </div>
          </div>
          <div className={`font-bold text-base ${getTotalColor()}`}>
            {formatCurrency(receipt.purchasePrice || 0)}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm mb-2">
          <div>
            <span className="text-gray-500 text-xs uppercase">Type</span>
            <div className="font-medium">{getReceiptType()}</div>
          </div>
          <div>
            <span className="text-gray-500 text-xs uppercase">Category</span>
            <div className="font-medium truncate">{receipt.expense_type || "—"}</div>
          </div>
          {(() => {
            const paymentDisplay = getPaymentDisplay(receipt);
            const hasPayment = paymentDisplay && paymentDisplay !== "-" && paymentDisplay !== "—";
            if (!hasPayment) return null;
            const logo = getPaymentLogo(receipt);
            return (
              <div>
                <span className="text-gray-500 text-xs uppercase">Payment</span>
                <div className="flex items-center gap-1 font-medium">
                  {logo && (
                    <img
                      src={logo}
                      alt="Payment logo"
                      className="w-4 h-4 object-contain"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <span className="truncate">{paymentDisplay}</span>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600 truncate flex-1 mr-2">
            {receipt.product_name || "—"}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onViewClick}
              className="text-blue-600 font-semibold hover:underline text-sm"
            >
              Edit
            </button>
            {quickbooksConnected && onLinkToQuickBooks && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLinkToQuickBooks();
                }}
                disabled={isLinking}
                className="p-1.5 hover:bg-green-50 rounded-full transition-colors group"
                title="Link to QuickBooks"
              >
                {isLinking ? (
                  <Loader2 size={16} className="text-green-500 animate-spin" />
                ) : (
                  <Link2 size={16} className="text-green-500 group-hover:text-green-600" />
                )}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteClick && onDeleteClick(receipt);
              }}
              className="p-1.5 hover:bg-red-50 rounded-full transition-colors group"
              title="Delete receipt"
            >
              <Trash2 size={16} className="text-red-500 group-hover:text-red-600" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ReceiptsTable;