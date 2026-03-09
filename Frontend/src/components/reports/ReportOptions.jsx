import { useState, useEffect, useRef } from "react";
import { FileText } from "lucide-react";
import CustomizedReport from "../../pages/CustomizedReport";
import TaxTypePopup from "../filters/TaxTypePopup";

const toTaxLabel = (tax) => {
  const name = (tax?.tax_name ?? "").toString().trim() || "Unknown";
  if (name.toLowerCase().startsWith("tip")) return "Tip";
  const val = tax?.tax_rate != null ? parseFloat(String(tax.tax_rate).replace(/%/g, "")) : 0;
  const rounded = Math.round(isNaN(val) ? 0 : val);
  return `${name} | ${rounded}%`;
};

const ReportOptions = ({ 
  activeMenu, 
  setActiveMenu, 
  onSelectReport,
  onApplyTaxTypes,
  selectedTaxAndTipsTypes,
  setShowCustomizedReport,
  iconOnly = false,
}) => {
  const [showTaxPopup, setShowTaxPopup] = useState(false);
  const [selectedTaxTypes, setSelectedTaxTypes] = useState([]);
  const [isClosingReport, setIsClosingReport] = useState(false);
  const reportMenuRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const ignoreNextClickRef = useRef(false);

  const closeMenu = () => {
    setIsClosingReport(true);
    closeTimeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
      setIsClosingReport(false);
    }, 150);
  };

  // Close dropdown when clicking/tapping outside (mobile + desktop)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!reportMenuRef.current || activeMenu !== "option") return;
      const target = event.target;
      if (!reportMenuRef.current.contains(target)) {
        closeMenu();
      }
    };
    if (activeMenu === "option") {
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

  // Clear close timeout on unmount
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
    if (activeMenu === "option") {
      closeMenu();
      ignoreNextClickRef.current = true;
      setTimeout(() => { ignoreNextClickRef.current = false; }, 300);
    } else {
      setActiveMenu("option");
    }
  };

  const handleTriggerMouseDown = () => {
    if (activeMenu === "option") {
      closeMenu();
      ignoreNextClickRef.current = true;
    }
  };

  const handleReportClick = (type) => {
    setActiveMenu(null);
    setIsClosingReport(false);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    
    if (type === "summary") {
      onSelectReport("summary");
    } else if (type === "tax") {
      // Check if user has already selected tax types from the filter menu
      // If yes, skip the popup and go directly to report generation
      if (selectedTaxAndTipsTypes && selectedTaxAndTipsTypes.length > 0) {
        onSelectReport("tax");
      } else {
        // Show popup only if no tax types are selected
        setShowTaxPopup(true);
      }
    } else if (type === "customized") {
      setShowCustomizedReport(true);
    }
  };

  return (
    <>
      <div className="relative" ref={reportMenuRef}>
        <button
          className={`report-options-trigger text-blue-600 hover:text-blue-800 m-0 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] rounded focus:outline-none focus:ring-0 border-0 bg-transparent ${iconOnly ? "p-2 flex items-center justify-center" : "text-sm sm:text-base md:text-lg font-bold sm:font-black py-1 sm:py-0 px-2 sm:px-0 whitespace-nowrap"}`}
          title={iconOnly ? "Create Report" : undefined}
          onMouseDown={(e) => {
            e.stopPropagation();
            handleTriggerMouseDown();
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleTriggerClick(e);
          }}
        >
          {iconOnly ? (
            <FileText size={20} strokeWidth={2.2} />
          ) : (
            <>
              <span className="hidden sm:inline">Create Report</span>
              <span className="sm:hidden">Report</span>
            </>
          )}
        </button>

        {(activeMenu === "option" || isClosingReport) && (
          <div
            className={`absolute mt-2 sm:mt-4 right-0 bg-white text-black rounded-lg w-40 sm:w-44 z-[9999] overflow-hidden shadow-xl report-dropdown-panel ${
              isClosingReport ? "report-dropdown-closing" : "animate-report-dropdown"
            }`}
            style={{ boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.12), 0 4px 6px -4px rgb(0 0 0 / 0.08)" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => handleReportClick("summary")}
              className="report-option-item block w-full text-left px-3 sm:px-4 py-2.5 text-sm sm:text-base text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-all duration-150 first:pt-2.5 hover:shadow-[inset_3px_0_0_0_#2563eb] active:bg-blue-100"
            >
              Summary Report
            </button>
            <button
              onClick={() => handleReportClick("tax")}
              className="report-option-item block w-full text-left px-3 sm:px-4 py-2.5 text-sm sm:text-base text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-all duration-150 hover:shadow-[inset_3px_0_0_0_#2563eb] active:bg-blue-100"
            >
              Tax Report
            </button>
            <button
              onClick={() => handleReportClick("customized")}
              className="report-option-item block w-full text-left px-3 sm:px-4 py-2.5 text-sm sm:text-base text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-all duration-150 last:pb-2.5 hover:shadow-[inset_3px_0_0_0_#2563eb] active:bg-blue-100"
            >
              Customized Report
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

export default ReportOptions;