import { useState, useRef, useEffect } from "react";
import { Trash2, Link2, Loader2 } from "lucide-react";
import MerchantAvatar from "../MerchantAvatar";
import SimpleAlertModal from "../SimpleAlertModal";
import { formatReceiptDate } from "../../utils/receiptDate";

const ReceiptsMobileView = ({
  receipt,
  getPaymentLogo,
  getPaymentDisplay,
  onViewClick,
  onDeleteClick,
  onLinkToQuickBooks,
  quickbooksConnected,
  onLinkToSage,
  isLinking,
  isLinkingSage,
  onLinkToXero,
  isLinkingXero,
  formatCurrency,
  onClearQuickbooksLink,
  isToBeVerified = false,
  disableDelete = false,
}) => {
  const [showIntegrateMenu, setShowIntegrateMenu] = useState(false);
  const [showCloudPopup, setShowCloudPopup] = useState(false);
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

  const getFormattedDate = () => formatReceiptDate(receipt);

  const getReceiptType = () => {
    return receipt.receipt_category == 0
      ? "Personal"
      : receipt.receipt_category == 1
      ? "Business"
      : "—";
  };

  const getTotalColor = () => {
    // If receipt is unread, show light grey color
    if (receipt.status === "0") {
      return "text-gray-400";
    }
    return Number(receipt.purchasePrice) < 0 ? "text-red-600" : "text-green-700";
  };

  // Determine if receipt is unread for other text elements
  const isUnread = receipt.status === "0";

  return (
    <>
    <div className={`md:hidden flex flex-col gap-3 border rounded-2xl p-4 bg-white shadow-sm ${isToBeVerified ? 'border-amber-400 border-2 bg-amber-50/30' : isUnread ? 'border-blue-500 border-2' : 'border-gray-200'}`}>
      {isToBeVerified && (
        <span className="self-start bg-amber-50 text-amber-600 text-xs font-bold px-2 py-1 rounded-full border border-amber-400 uppercase tracking-wide">
          To Be Verified
        </span>
      )}
      <div className={`flex justify-between items-center ${isUnread ? 'text-gray-400' : 'text-gray-800'}`}>
        <div className={`font-semibold ${isUnread ? 'text-gray-400' : ''}`}>
          {getFormattedDate()}
        </div>
        <div className={`font-bold text-base ${getTotalColor()}`}>
          {formatCurrency(receipt.purchasePrice || 0)}
        </div>
      </div>
      
      <div className={`flex items-center gap-2 ${isUnread ? 'text-gray-400' : ''}`}>
        <MerchantAvatar
          name={receipt.storeName || receipt.merchant}
          explicitUrl={receipt.store_image}
        />
        <div className={`font-semibold text-gray-900 text-base ${isUnread ? 'text-gray-400' : ''}`}>
          {receipt.storeName || receipt.merchant || "—"}
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-gray-800">
        <div>
          <div className={`text-[12px] uppercase text-gray-500 font-semibold ${isUnread ? 'text-gray-400' : ''}`}>
            Type
          </div>
          <div className={`font-semibold text-gray-900 ${isUnread ? 'text-gray-400' : ''}`}>
            {getReceiptType()}
          </div>
        </div>
        
        <div>
          <div className={`text-[12px] uppercase text-gray-500 font-semibold ${isUnread ? 'text-gray-400' : ''}`}>
            Category
          </div>
          <div className={`font-medium ${isUnread ? 'text-gray-400' : ''}`}>
            {receipt.expense_type || "—"}
          </div>
        </div>
        
        <div className="col-span-2">
          <div className={`text-[12px] uppercase text-gray-500 font-semibold ${isUnread ? 'text-gray-400' : ''}`}>
            Description
          </div>
          <div className={`font-medium ${isUnread ? 'text-gray-400' : ''}`}>
            {receipt.product_name || "—"}
          </div>
        </div>
        
        {(() => {
          const paymentDisplay = getPaymentDisplay(receipt);
          const hasPayment = paymentDisplay && paymentDisplay !== "-" && paymentDisplay !== "—";
          if (!hasPayment) return null;
          const logo = getPaymentLogo(receipt);
          return (
            <div className="col-span-2 flex items-center gap-2">
              {logo && (
                <img
                  src={logo}
                  alt="Payment logo"
                  className="w-5 h-5 object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div className={`text-gray-900 font-medium ${isUnread ? 'text-gray-400' : ''}`}>
                {paymentDisplay}
              </div>
            </div>
          );
        })()}
      </div>
      
      {receipt.quickbooksLinked && (
        <div className="mt-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-emerald-500 text-emerald-600 text-[11px] font-semibold">
            Connected to QuickBooks
          </span>
        </div>
      )}
      
      <div className="flex justify-end items-center gap-2">
        <button
          onClick={onViewClick}
          className="text-blue-600 font-semibold hover:underline"
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
            if (disableDelete) return;
            onDeleteClick && onDeleteClick(receipt);
          }}
          disabled={disableDelete}
          className={`p-1.5 transition-colors group ${disableDelete ? "opacity-40 cursor-not-allowed" : ""}`}
          title={disableDelete ? "Draft receipts cannot be swiped/deleted" : "Delete receipt"}
        >
          <Trash2 size={16} className="text-red-500 group-hover:text-red-600" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowCloudPopup(true);
          }}
          className="p-1 hover:opacity-70 transition-opacity flex-shrink-0"
          title="Backed up to cloud"
        >
          <img src="/cloudsave.svg" alt="Cloud saved" className="w-5 h-5 object-contain" />
        </button>
      </div>
    </div>
    {showCloudPopup && (
      <SimpleAlertModal
        message="Your information has been backed up to the cloud"
        onClose={() => setShowCloudPopup(false)}
      />
    )}
    </>
  );
};

export default ReceiptsMobileView;