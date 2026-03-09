import { forwardRef } from "react";
import { Save, Mail, FileText, Download, Archive, X, Link2 } from "lucide-react";

const ShareOptions = forwardRef(
  (
    {
      onSaveAsPDF,
      onDownloadPDF,
      onEmailReceipt,
      onViewReport,
      onDownloadCSV,
      onDownloadZIP,
      onLinkToQuickBooks,
      quickbooksConnected,
      onClose,
    },
    ref
  ) => {
  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-2 bg-white shadow-xl border border-gray-200 rounded-lg p-3 z-[100] min-w-[200px] max-w-[90vw]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap justify-between items-center mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Share Options</h3>
      </div>
      
      <div className="space-y-2">
        <button
          onClick={onViewReport}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors"
        >
          <FileText size={16} className="text-blue-500" />
          <span>View Report</span>
        </button>
        
        {/* <button
          onClick={onSaveAsPDF}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors"
        >
          <Save size={16} className="text-blue-500" />
          <span>Preview PDF</span>
        </button> */}
        
        <button
          onClick={onDownloadPDF}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors"
        >
          <Download size={16} className="text-blue-500" />
          <span>Download PDF</span>
        </button>
        
        <button
          onClick={onDownloadCSV}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors"
        >
          <Download size={16} className="text-green-500" />
          <span>Download CSV</span>
        </button>
        
        <button
          onClick={onDownloadZIP}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors"
        >
          <Archive size={16} className="text-purple-500" />
          <span>Download ZIP</span>
        </button>
        
        <button
          onClick={onEmailReceipt}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors"
        >
          <Mail size={16} className="text-orange-500" />
          <span>Email</span>
        </button>

        {quickbooksConnected && onLinkToQuickBooks && (
          <button
            onClick={onLinkToQuickBooks}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-green-50 hover:text-green-600 rounded-md transition-colors"
          >
            <Link2 size={16} className="text-green-500" />
            <span>Link to QuickBooks</span>
          </button>
        )}

        <hr className="my-2" />
        
        <button
          onClick={onClose}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded-md transition-colors"
        >
          <X size={16} className="text-gray-500" />
          <span>Cancel</span>
        </button>
      </div>
    </div>
  );
  }
);

ShareOptions.displayName = "ShareOptions";

export default ShareOptions;