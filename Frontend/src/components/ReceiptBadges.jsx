
const ReceiptBadges = ({ receipt }) => {
  const status = receipt.badgeStatus;
  const isQuickbooksLinked = receipt.quickbooksLinked;

  if (!status && !isQuickbooksLinked) return null;

  return (
    <div className="flex gap-1 mb-2 flex-wrap">
      {(status === "both" || status === "forwarded") && (
        <span className="bg-white text-green-500 text-xs font-semibold px-2 py-1 rounded-full border border-green-500">
          Forwarded
        </span>
      )}
      {(status === "both" || status === "received") && (
        <span className="bg-white text-blue-500 text-xs font-semibold px-2 py-1 rounded-full border border-blue-500">
          Received
        </span>
      )}
      {isQuickbooksLinked && (
        <span className="bg-white text-emerald-600 text-xs font-semibold px-2 py-1 rounded-full border border-emerald-500 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>QuickBooks</span>
        </span>
      )}
    </div>
  );
};

export default ReceiptBadges;                                                                                     