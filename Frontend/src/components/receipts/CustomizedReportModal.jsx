import { forwardRef } from "react";
import CustomizedReport from "../../pages/CustomizedReport";

const CustomizedReportModal = forwardRef(({ onClose, receipts }, ref) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-5xl relative max-h-[90vh] overflow-y-auto">
        <div className="flex items-center mb-4 sticky top-0 bg-white pb-2 border-b border-gray-200">
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
        
        <CustomizedReport
          ref={ref}
          receipts={receipts}
          onClose={onClose}
        />
      </div>
    </div>
  );
});

CustomizedReportModal.displayName = "CustomizedReportModal";

export default CustomizedReportModal;