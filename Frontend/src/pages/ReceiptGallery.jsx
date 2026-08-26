import { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import Header from "../components/Header";
import PropagateLoader from "react-spinners/PropagateLoader";
import { useData } from "../context/DataContext";
import { useReceiptFilters } from "../hooks/useReceiptFilters";
import { useReceiptGrouping } from "../hooks/useReceiptGrouping";
import { useReceiptSorting } from "../hooks/useReceiptSorting";
import { proxyImageUrl } from "../api/Axios";
import PdfThumbnail from "../components/receipts/PdfThumbnail";
import ReceiptGalleryLightbox from "../components/receipts/ReceiptGalleryLightbox";
import {
  buildReceiptGalleryItems,
  hasActiveReceiptFilters,
} from "../utils/receiptGallery";

const ReceiptGallery = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { receipts, loading } = useData();
  const { filters, searchTerm } = useReceiptFilters();
  const { sortConfig } = useReceiptSorting();
  const { draftReceipts, filteredReceipts } = useReceiptGrouping(
    receipts,
    filters,
    sortConfig,
    searchTerm
  );

  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Prefer the exact filtered list passed from HomePage so the gallery
  // matches what the user was looking at (avoids localStorage date/filter drift).
  const navReceiptIds = location.state?.receiptIds;
  const hasNavReceiptIds = Array.isArray(navReceiptIds);

  const visibleReceipts = useMemo(() => {
    if (hasNavReceiptIds) {
      const byId = new Map(
        (receipts || []).map((r) => [String(r?.id), r])
      );
      return navReceiptIds
        .map((id) => byId.get(String(id)))
        .filter(Boolean);
    }

    const seen = new Set();
    const ordered = [];
    [...draftReceipts, ...filteredReceipts].forEach((r) => {
      if (!r?.id || seen.has(r.id)) return;
      seen.add(r.id);
      ordered.push(r);
    });
    return ordered;
  }, [
    hasNavReceiptIds,
    navReceiptIds,
    receipts,
    draftReceipts,
    filteredReceipts,
  ]);

  const galleryItems = useMemo(
    () => buildReceiptGalleryItems(visibleReceipts),
    [visibleReceipts]
  );

  const isFiltered =
    typeof location.state?.isFiltered === "boolean"
      ? location.state.isFiltered
      : hasActiveReceiptFilters(filters, searchTerm);
  const pageTitle = isFiltered ? "Receipt Images (Filtered)" : "Receipt Images";

  return (
    <div className="min-h-screen bg-[#f0f4ff]">
      <Header />

      <div className="sticky top-[52px] sm:top-[60px] z-40 bg-[#0f172a] text-white px-3 sm:px-4 py-3 flex items-center shadow-md">
        <button
          type="button"
          onClick={() => navigate("/homepage")}
          className="p-1 -ml-1 hover:text-blue-300 transition-colors"
          aria-label="Back to receipts"
        >
          <ChevronLeft size={26} />
        </button>
        <h1 className="flex-1 text-center text-base sm:text-lg font-semibold pr-7">
          {pageTitle}
        </h1>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-24">
          <PropagateLoader color="#2563eb" size={12} />
        </div>
      ) : galleryItems.length === 0 ? (
        <div className="text-center py-24 px-6 text-slate-500">
          <p className="text-lg font-medium text-slate-700">No receipt images</p>
          <p className="mt-2 text-sm">
            {isFiltered
              ? "No images match your current filters."
              : "Add receipts with photos to see them here."}
          </p>
        </div>
      ) : (
        <div className="px-2 py-3 sm:px-4 sm:py-4">
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2 sm:gap-2.5">
            {galleryItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLightboxIndex(index)}
                className="aspect-square bg-white border border-slate-200 rounded-md overflow-hidden shadow-sm hover:shadow-md hover:border-blue-300 hover:ring-2 hover:ring-blue-200 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={`View receipt image from ${item.storeName || "receipt"}`}
              >
                {item.isPdf ? (
                  <PdfThumbnail
                    url={item.url}
                    className="w-full h-full border-0 rounded-none"
                    title={item.storeName || "Receipt PDF"}
                    linkless
                  />
                ) : (
                  <img
                    src={proxyImageUrl(item.url)}
                    alt={item.storeName || "Receipt"}
                    className="w-full h-full object-contain bg-slate-50 p-0.5"
                    loading="lazy"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <ReceiptGalleryLightbox
          items={galleryItems}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
};

export default ReceiptGallery;
