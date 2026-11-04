import receiptIllustration from "../../assets/empty-receipt.jpg";
import cameraIcon from "../../assets/empty-camera.png";

/**
 * Empty state for the Receipts page — shown only when the user has zero receipts.
 * Search, filters and the list toolbar are hidden by the parent in this state.
 * On the WebApp receipts are uploaded (not photographed), so the copy and CTA
 * say "Upload" rather than "Snap a photo" / "Scan".
 */
const ReceiptsEmptyState = ({ onUpload }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-14 sm:py-20">
      {/* Hero illustration */}
      <img
        src={receiptIllustration}
        alt=""
        aria-hidden="true"
        className="w-44 sm:w-52 rounded-2xl shadow-sm select-none"
        draggable="false"
      />

      <h3 className="mt-7 text-xl sm:text-2xl font-bold text-gray-900">
        No receipts yet
      </h3>
      <p className="mt-2 max-w-xs text-sm sm:text-base text-gray-500 leading-relaxed">
        Upload a receipt and we&rsquo;ll auto-extract the date, merchant and total.
      </p>

      {/* Camera upload button */}
      <button
        type="button"
        onClick={onUpload}
        className="group mt-7 flex flex-col items-center gap-3 focus:outline-none"
        aria-label="Upload a receipt"
      >
        <span className="w-24 h-24 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shadow-sm transition-all group-hover:bg-blue-100 group-hover:border-blue-300 group-hover:shadow-md group-active:scale-95">
          <img
            src={cameraIcon}
            alt=""
            aria-hidden="true"
            className="w-14 select-none"
            draggable="false"
          />
        </span>
        <span className="text-blue-600 font-semibold text-sm">
          Upload Receipt
        </span>
      </button>

      <p className="mt-2 text-xs text-gray-400">
        Import from your photos or files.
      </p>
    </div>
  );
};

export default ReceiptsEmptyState;
