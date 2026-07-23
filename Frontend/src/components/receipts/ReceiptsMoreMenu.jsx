import { useState, useEffect, useRef } from "react";
import { MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import TaxTypePopup from "../filters/TaxTypePopup";
import { toTaxLabel } from "../../utils/receiptFormatters";
import { collectReceiptMediaUrls } from "../../utils/mediaUrlUtils";

const ReceiptsMoreMenu = ({
  activeMenu,
  setActiveMenu,
  onSelectReport,
  onApplyTaxTypes,
  selectedTaxAndTipsTypes,
  setShowCustomizedReport,
  receiptsForExport = [],
  isFiltered = false,
  iconOnly = false,
}) => {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showTaxPopup, setShowTaxPopup] = useState(false);
  const [selectedTaxTypes, setSelectedTaxTypes] = useState([]);
  const closeTimeoutRef = useRef(null);
  const ignoreNextClickRef = useRef(false);

  const closeMenu = () => {
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
      setIsClosing(false);
    }, 150);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!menuRef.current || activeMenu !== "more") return;
      if (!menuRef.current.contains(event.target)) {
        closeMenu();
      }
    };
    if (activeMenu === "more") {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside, { passive: true });
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
        if (closeTimeoutRef.current) {
          clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
      };
    }
  }, [activeMenu, setActiveMenu]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleTriggerClick = (e) => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      e.preventDefault();
      return;
    }
    if (activeMenu === "more") {
      closeMenu();
      ignoreNextClickRef.current = true;
      setTimeout(() => {
        ignoreNextClickRef.current = false;
      }, 300);
    } else {
      setActiveMenu("more");
    }
  };

  const handleTriggerMouseDown = () => {
    if (activeMenu === "more") {
      closeMenu();
      ignoreNextClickRef.current = true;
    }
  };

  const dismiss = () => {
    setActiveMenu(null);
    setIsClosing(false);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  };

  const handleReceiptGallery = () => {
    dismiss();
    navigate("/receipt-gallery", {
      state: {
        receiptIds: receiptsForExport.map((r) => r?.id).filter((id) => id != null),
        isFiltered: !!isFiltered,
      },
    });
  };

  const handleReportClick = (type) => {
    dismiss();
    if (type === "summary") {
      onSelectReport("summary");
    } else if (type === "tax") {
      if (selectedTaxAndTipsTypes?.length > 0) {
        onSelectReport("tax");
      } else {
        setShowTaxPopup(true);
      }
    } else if (type === "customized") {
      setShowCustomizedReport(true);
    }
  };

  const handleCsvExport = () => {
    dismiss();
    const csvData = receiptsForExport.map((receipt) => {
      const taxValues = receipt.receipt_tax_values || [];
      const tax1 = taxValues[0] || {};
      const tax2 = taxValues[1] || {};
      const purchaseDate = receipt.product_date
        ? new Date(Number(receipt.product_date) * 1000).toLocaleDateString("en-US")
        : "";
      const mediaUrls = collectReceiptMediaUrls(receipt);

      return {
        "Purchase Date": purchaseDate,
        "Store Name": receipt.storeName || "",
        "Expense Type":
          receipt.receipt_category === "1"
            ? "Business"
            : receipt.receipt_category === "0"
              ? "Personal"
              : "—",
        Category: receipt.expense_type || "",
        "Payment Method": receipt.paymentType || "",
        Subtotal: receipt.subtotal || "",
        "Tax Type 1 Name": tax1.tax_name || "N/A",
        "Tax Type 1 Amount": tax1.tax_amount || 0,
        "Tax Type 2 Name": tax2.tax_name || "N/A",
        "Tax Type 2 Amount": tax2.tax_amount || 0,
        Total: receipt.purchasePrice || "",
        Description: receipt.description || "",
        Notes: receipt.notes || "",
        "Receipt Images": mediaUrls.join(", "),
      };
    });

    const ws = XLSX.utils.json_to_sheet(csvData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Receipts");
    const dateStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `receipts_${dateStr}.csv`, { bookType: "csv" });
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className={`text-blue-600 hover:text-blue-800 m-0 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] rounded focus:outline-none focus:ring-0 border-0 bg-transparent ${
            iconOnly
              ? "p-2 flex items-center justify-center"
              : "text-sm sm:text-base font-bold py-1 px-2 whitespace-nowrap"
          }`}
          title="More options"
          onMouseDown={(e) => {
            e.stopPropagation();
            handleTriggerMouseDown();
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleTriggerClick(e);
          }}
        >
          <MoreHorizontal size={20} strokeWidth={2.2} />
        </button>

        {(activeMenu === "more" || isClosing) && (
          <div
            className={`absolute mt-2 sm:mt-4 right-0 bg-white text-black rounded-lg w-44 sm:w-48 z-[9999] overflow-hidden shadow-xl report-dropdown-panel ${
              isClosing ? "report-dropdown-closing" : "animate-report-dropdown"
            }`}
            style={{
              boxShadow:
                "0 10px 25px -5px rgb(0 0 0 / 0.12), 0 4px 6px -4px rgb(0 0 0 / 0.08)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleReceiptGallery}
              className="report-option-item block w-full text-left px-3 sm:px-4 py-2.5 text-sm sm:text-base text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-all duration-150 first:pt-2.5 hover:shadow-[inset_3px_0_0_0_#2563eb] active:bg-blue-100"
            >
              Receipt Gallery
            </button>
            <button
              type="button"
              onClick={() => handleReportClick("summary")}
              className="report-option-item block w-full text-left px-3 sm:px-4 py-2.5 text-sm sm:text-base text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-all duration-150 hover:shadow-[inset_3px_0_0_0_#2563eb] active:bg-blue-100"
            >
              Reports
            </button>
            <button
              type="button"
              onClick={handleCsvExport}
              className="report-option-item block w-full text-left px-3 sm:px-4 py-2.5 text-sm sm:text-base text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-all duration-150 last:pb-2.5 hover:shadow-[inset_3px_0_0_0_#2563eb] active:bg-blue-100"
            >
              CSV File
            </button>
          </div>
        )}
      </div>

      {showTaxPopup && (
        <TaxTypePopup
          show={showTaxPopup}
          onClose={() => setShowTaxPopup(false)}
          onApply={(selectedTaxTypesFromPopup) => {
            setSelectedTaxTypes(selectedTaxTypesFromPopup);
            if (onApplyTaxTypes && selectedTaxTypesFromPopup?.length > 0) {
              const labels = selectedTaxTypesFromPopup.map(toTaxLabel);
              onApplyTaxTypes(labels);
            }
            onSelectReport("tax");
          }}
          selectedTaxTypes={selectedTaxTypes}
          setSelectedTaxTypes={setSelectedTaxTypes}
        />
      )}
    </>
  );
};

export default ReceiptsMoreMenu;
