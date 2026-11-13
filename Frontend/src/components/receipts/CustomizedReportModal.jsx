import { forwardRef } from "react";
import CustomizedReport from "../../pages/CustomizedReport";

const CustomizedReportModal = forwardRef(({ onClose, receipts }, ref) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-5xl relative max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center shrink-0 bg-white px-4 sm:px-6 pt-4 sm:pt-6 pb-2 border-b border-gray-200">
          {/* Close Button - Fixed width for balance */}
          <div className="w-20 flex justify-start">
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-black text-white hover:bg-gray-800 transition-colors"
              aria-label="Close"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* Title - Center */}
          <h4 className="flex-1 text-lg font-semibold text-center text-gray-900">
            CUSTOMIZE YOUR REPORT
          </h4>

          {/* Clear All Button - Fixed width to match left */}
          <div className="w-20 flex justify-end">
            <button
              onClick={() => {
                if (ref.current) {
                  ref.current.clearAllFilters();
                }
              }}
              className="text-blue-600 hover:underline font-medium text-sm"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pt-4 pb-4 sm:pb-6">
          <CustomizedReport
            ref={ref}
            receipts={receipts}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
});

CustomizedReportModal.displayName = "CustomizedReportModal";

export default CustomizedReportModal;