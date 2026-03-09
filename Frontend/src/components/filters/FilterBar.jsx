import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Filter } from "lucide-react";
import TotalFilterModel from "./TotalFilterModel";
import DateFilterModal from "./DateFilterModal";
import MerchantFilterModal from "./MerchantFilterModal";
import ExpenseTypeFilterModel from "./ExpenseTypeFilterModel";
import ReceiptCategoryFilterModel from "./ReceiptCategoryFilterModel";
import PaymentFilterMethod from "./PaymentFilterMethod";
import TaxtypesAndTipsFilterModel from "./Taxtypes&TipsFilterModel";
import MoreFiltersMenu from "./MoreFiltersMenu";
import MobileTagsModal from "./MobileTagsModal";

const FILTER_OPTIONS = [
  { key: "date", label: "Date", modal: DateFilterModal },
  { key: "expenseCategory", label: "Expense Category", modal: ExpenseTypeFilterModel },
  { key: "merchant", label: "Merchant", modal: MerchantFilterModal },
  { key: "paymentMethod", label: "Payment Method", modal: PaymentFilterMethod },
  { key: "receiptCategory", label: "Expense Type", modal: ReceiptCategoryFilterModel },
  { key: "taxTypes", label: "Tax Types & Tips", modal: TaxtypesAndTipsFilterModel },
  { key: "price", label: "Total", modal: TotalFilterModel },
];

const FilterBar = ({ activeMenu, setActiveMenu, filters, updateFilter, iconOnly = false }) => {
  const [showModal, setShowModal] = useState(null);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const filterMenuRef = useRef(null);

  // Close menu when clicking/tapping outside (mobile + desktop)
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target)) {
        setActiveMenu(null);
      }
    };

    if (activeMenu === "filter") {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside, { passive: true });
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [activeMenu, setActiveMenu]);

  const handleFilterClick = (filterKey) => {
    if (filterKey === "tags") {
      setActiveMenu(null);
      setShowTagsModal(true);
    } else {
      setShowModal(filterKey);
      // Close dropdown after modal has a chance to mount (fixes mobile visibility)
      requestAnimationFrame(() => setActiveMenu(null));
    }
  };

  const handleApplyFilter = (filterKey, value, additionalData = null) => {
    updateFilter(filterKey, value, additionalData);
    setShowModal(null);
  };

  const renderModal = () => {
    if (!showModal) return null;

    const filterOption = FILTER_OPTIONS.find(opt => opt.key === showModal);
    if (!filterOption) return null;

    const ModalComponent = filterOption.modal;
    const initialSelected = filters[showModal];

    const modalContent = (
      <ModalComponent
        onClose={() => setShowModal(null)}
        onApply={(value, data) => handleApplyFilter(showModal, value, data)}
        initialSelected={initialSelected}
      />
    );
    // Portal to document.body with high z-index so modal is visible on mobile above header/sticky bar
    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 9999 }}>{modalContent}</div>,
      document.body
    );
  };

  return (
    <>
      <div className={`relative ${iconOnly ? "w-auto shrink-0" : "w-full md:w-auto"}`} ref={filterMenuRef}>
        <button
          onMouseDown={(e) => {
            e.stopPropagation();
            if (activeMenu === "option") setActiveMenu(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            setActiveMenu((prev) => (prev === "filter" ? null : "filter"));
          }}
          title={iconOnly ? "Filter" : undefined}
          className={`flex items-center justify-center border border-blue-500 font-bold text-blue-600 rounded-full ${iconOnly ? "p-2 w-10 h-10 shrink-0" : "gap-x-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm w-full md:w-[135px]"}`}
        >
          <Filter size={iconOnly ? 18 : 14} className={iconOnly ? "" : "sm:w-4 sm:h-4"} />
          {!iconOnly && " Filter"}
        </button>

        {activeMenu === "filter" && (
          <div
            className="absolute top-10 sm:top-12 left-0 md:left-auto md:right-0 bg-white text-sm text-gray-700 rounded-lg shadow-lg w-full min-w-[200px] sm:w-56 z-[100] border max-h-[60vh] overflow-y-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ul className="divide-y divide-gray-200">
              {FILTER_OPTIONS.map((item) => (
                <li
                  key={item.key}
                  className="px-3 sm:px-4 py-2.5 sm:py-2 hover:bg-blue-50 cursor-pointer text-sm active:bg-blue-100"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleFilterClick(item.key);
                  }}
                >
                  {item.label}
                </li>
              ))}
              {/* More Filters / Tags option - visible on mobile only in dropdown */}
              <li
                key="tags"
                className="px-3 sm:px-4 py-2.5 sm:py-2 hover:bg-blue-50 cursor-pointer text-sm md:hidden font-medium text-blue-600 active:bg-blue-100"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleFilterClick("tags");
                }}
              >
                More Filters (Tags)
                {filters.tags?.length > 0 && (
                  <span className="ml-2 bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs">
                    {filters.tags.length}
                  </span>
                )}
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* More Filters Button - Desktop/Tablet only */}
      <MoreFiltersMenu
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        selectedTags={filters.tags}
        updateFilter={updateFilter}
      />

      {/* Mobile Tags Modal */}
      {showTagsModal && (
        <MobileTagsModal
          onClose={() => setShowTagsModal(false)}
          selectedTags={filters.tags || []}
          updateFilter={updateFilter}
        />
      )}

      {/* Render Modals */}
      {renderModal()}
    </>
  );
};

export default FilterBar;