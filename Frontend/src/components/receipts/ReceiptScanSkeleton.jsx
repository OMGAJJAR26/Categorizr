/**
 * Placeholder card shown in the "Draft Receipts" section while a scanned receipt
 * is being uploaded + OCR'd. One per in-flight scan; each is replaced by the real
 * draft as its scan finishes. Mirrors the iOS/Android scan progress UX.
 */
const Bar = ({ className = "" }) => (
  <div className={`bg-gray-200 rounded animate-pulse ${className}`} />
);

const ReceiptScanSkeleton = () => {
  return (
    <div
      className="border-2 border-amber-300 bg-amber-50/40 rounded-2xl p-4 flex flex-col gap-3"
      aria-busy="true"
      aria-label="Scanning receipt"
    >
      <div className="flex items-center justify-between">
        <span className="bg-amber-100 text-amber-500 text-xs font-bold px-2 py-1 rounded-full border border-amber-300 uppercase tracking-wide">
          Scanning…
        </span>
        <Bar className="h-4 w-16" />
      </div>

      <div className="flex items-center gap-2.5">
        <Bar className="w-8 h-8 rounded-lg" />
        <Bar className="h-4 w-32" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Bar className="h-2.5 w-10" />
          <Bar className="h-3.5 w-20" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Bar className="h-2.5 w-14" />
          <Bar className="h-3.5 w-24" />
        </div>
      </div>

      <Bar className="h-3.5 w-28" />
    </div>
  );
};

export default ReceiptScanSkeleton;
