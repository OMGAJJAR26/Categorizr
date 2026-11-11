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
      className="absolute top-full right-0 mt-2 bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 rounded-lg p-3 z-[100] min-w-[200px] max-w-[90vw]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Share Options</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          aria-label="Close"
        >
          <X size={15} className="text-gray-700" />
        </button>
      </div>

      <div className="space-y-1">
        <button
          onClick={onViewReport}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
        >
          <FileText size={16} className="text-blue-500" />
          <span>View Report</span>
        </button>

        <button
          onClick={onDownloadPDF}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
        >
          <Download size={16} className="text-blue-500" />
          <span>Download PDF</span>
        </button>

        <button
          onClick={onDownloadCSV}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
        >
          <Download size={16} className="text-green-500" />
          <span>Download CSV</span>
        </button>

        <button
          onClick={onDownloadZIP}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
        >
          <Archive size={16} className="text-purple-500" />
          <span>Download ZIP</span>
        </button>

        <button
          onClick={onEmailReceipt}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
        >
          <Mail size={16} className="text-orange-500" />
          <span>Email</span>
        </button>

        {quickbooksConnected && onLinkToQuickBooks && (
          <button
            onClick={onLinkToQuickBooks}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-green-50 dark:hover:bg-green-900/30 hover:text-green-600 dark:hover:text-green-400 rounded-md transition-colors"
          >
            <Link2 size={16} className="text-green-500" />
            <span>Link to QuickBooks</span>
          </button>
        )}
      </div>
    </div>
  );
  }
);

ShareOptions.displayName = "ShareOptions";

export default ShareOptions;