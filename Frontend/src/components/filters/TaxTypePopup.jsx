// src/components/TaxTypePopup.jsx
import { X } from "lucide-react";
import { useData } from "../../context/DataContext";
import { formatTaxRate } from "../../utils/receiptFormatters";
// Remove the import for generateTaxReportPDF since we don't want auto-download
// import { generateTaxReportPDF } from "../../generatePDF";

export default function TaxTypePopup({
  show,
  onClose,
  onApply,               // optional callback to parent with filtered receipts
   selectedTaxTypes,
  setSelectedTaxTypes,
  filteredReceipts,      // receipts already filtered on homepage
}) {
  const { receiptTaxValues, taxData } = useData();

  if (!show) return null;

  // Combine taxData from API with receiptTaxValues for backward compatibility
  const taxMap = new Map();
  
  // Add taxes from taxData API (saved tax types)
  if (Array.isArray(taxData)) {
    taxData.forEach((tax) => {
      const name = (tax.tax_name || "").toString().trim();
      const rate = (tax.tax_rate || "").toString().trim();
      if (name && rate) {
        const key = `${name}|${rate}`;
        if (!taxMap.has(key)) {
          taxMap.set(key, tax);
        }
      }
    });
  }
  
  // Also include taxes from receiptTaxValues for backward compatibility
  if (Array.isArray(receiptTaxValues)) {
    receiptTaxValues.forEach((tax) => {
      const name = (tax.tax_name || "").toString().trim();
      const rate = (tax.tax_rate || "").toString().trim();
      if (name && rate) {
        const key = `${name}|${rate}`;
        if (!taxMap.has(key)) {
          taxMap.set(key, tax);
        }
      }
    });
  }
  
  const uniqueTaxData = Array.from(taxMap.values());

  const mkKey = (name, rate) =>
    `${(name ?? "").toString().trim()}|${(rate ?? "").toString().trim()}`;

  const handleApply = () => {
    // Pass selected tax types (objects with tax_name, tax_rate) to parent
    // Parent uses them to update filters and generate report
    if (typeof onApply === "function") {
      onApply(selectedTaxTypes || []);
    }

    // REMOVED: The automatic PDF generation
    // generateTaxReportPDF({
    //   receipts: receiptsWithSelectedTaxes,
    //   selectedTaxes: selectedTaxTypes,
    //   monthLabel: "",
    // });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md relative flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b relative">
          <h4 className="text-lg font-semibold text-center flex-1">
            Select Tax Types
          </h4>
          <button onClick={onClose} className="absolute right-4 top-4 w-auto m-0">
            <X size={20} className="text-black" strokeWidth={2} style={{ stroke: "#000" }} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {uniqueTaxData.length === 0 ? (
            <div className="text-sm text-gray-500 py-2">No tax types found. Add receipts with tax data to see options.</div>
          ) : (
          uniqueTaxData.map((tax) => {
            const checked = (selectedTaxTypes || []).some(
              (t) => t.tax_name === tax.tax_name && t.tax_rate === tax.tax_rate
            );
            const key = `${tax.tax_name}-${tax.tax_rate}`;
            return (
              <label key={key} className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={checked}
                  className="w-auto"
                  onChange={() => {
                    if (checked) {
                      setSelectedTaxTypes((prev) =>
                        prev.filter(
                          (t) =>
                            !(
                              t.tax_name === tax.tax_name &&
                              t.tax_rate === tax.tax_rate
                            )
                        )
                      );
                    } else {
                      setSelectedTaxTypes((prev) => [...prev, tax]);
                    }
                  }}
                />
                <span>
                 {tax.tax_name} ({formatTaxRate(tax.tax_rate)}%)
                </span>
              </label>
            );
          })
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t bg-white sticky bottom-0">
          <button
            onClick={() => setSelectedTaxTypes([])}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Clear
          </button>
          <button
            onClick={handleApply}
            disabled={(selectedTaxTypes?.length || 0) === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}